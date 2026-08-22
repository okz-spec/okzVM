import { VMSettings, VMDebugInfo, Value } from '../shared/types';
import { CPU } from './cpu/CPU';
import { RAM } from './memory/RAM';
import { BytecodeInterpreter } from './interpreter/BytecodeInterpreter';
import { GraphicsEngine } from './graphics/GraphicsEngine';
import { Renderer3D, R3DVertex, R3DTriangle } from './renderer/Renderer3D';
import { RenderCommandBuffer } from './renderer/RenderCommandBuffer';
import { Presenter } from './presenter/Presenter';
import { InputManager } from './input/InputManager';
import { ErrorManager } from './error/ErrorManager';
import { ProcessManager } from './process/ProcessManager';
import { Scheduler } from './scheduler/Scheduler';
import { AudioEngine } from './audio/AudioEngine';
import { VirtualClock } from './clock/VirtualClock';
import { Process } from './process/Process';
import { BytecodeChunk, VMState } from './types';
import { Compiler } from '../compiler/compiler/Compiler';
import { registerNativeAPI } from './api/GlobalsAPI';

const MAX_FRAME_TIME_MS = 50;

export class VMCore {
  public state: VMState = VMState.Boot;
  private _previousState: VMState = VMState.Boot;

  public cpu: CPU;
  public ram: RAM;
  public interpreter: BytecodeInterpreter;
  public graphics: GraphicsEngine;
  public input: InputManager;
  public error: ErrorManager;
  public processes: ProcessManager;
  public scheduler: Scheduler;
  public audio: AudioEngine;
  public clock: VirtualClock;
  public renderer3D: Renderer3D;
  public rcmd: RenderCommandBuffer;
  public presenter: Presenter;

  public isRunning: boolean = false;
  private isLoading: boolean = false;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private settings: VMSettings;
  private logFn: (msg: string, type?: string) => void;
  private tickCount: number = 0;
  private fpsCounter: number = 0;
  private fpsTimer: number = 0;
  private currentFps: number = 0;
  private instructionsPerSecond: number = 0;
  private gpuCommandsPerSecond: number = 0;
  private lastTickCount: number = 0;
  private lastGpuCount: number = 0;
  private instructionsPerFrame: number;
  public projectDir: string = '';
  private lastFrameTick: number = 0;

  public mainProcess: Process | null = null;

  constructor(canvas: HTMLCanvasElement, settings: VMSettings, logFn: (msg: string, type?: string) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.settings = settings;
    this.logFn = logFn;

    this.ram = new RAM(settings.ramSize, logFn);
    this.cpu = new CPU(settings.cpuCores, settings.cpuFrequency);
    this.graphics = new GraphicsEngine(settings.videoWidth, settings.videoHeight);
    this.presenter = new Presenter(this.ctx);
    this.input = new InputManager(canvas);
    this.error = new ErrorManager(logFn);
    this.processes = new ProcessManager();
    this.scheduler = new Scheduler(500);
    this.audio = new AudioEngine(logFn);
    this.clock = new VirtualClock();
    this.interpreter = new BytecodeInterpreter();
    this.renderer3D = new Renderer3D();
    this.rcmd = new RenderCommandBuffer();

    this.instructionsPerFrame = this.calculateInstructionsPerFrame();
    this.setupInputListeners();
  }

  // ─── State Machine ────────────────────────────────────────────────

  public transitionState(newState: VMState): void {
    if (this.state === newState) return;
    this._previousState = this.state;
    this.state = newState;
    this.log(`VM state: ${this._previousState} → ${newState}`, 'info');
  }

  // ─── Settings ──────────────────────────────────────────────────────

  private calculateInstructionsPerFrame(): number {
    return Math.floor((this.settings.cpuFrequency * 1000000) / this.settings.fpsLimit);
  }

  public updateSettings(settings: VMSettings): void {
    this.settings = settings;
    this.ram.resize(settings.ramSize);
    this.graphics.resize(settings.videoWidth, settings.videoHeight);
    this.canvas.width = settings.videoWidth;
    this.canvas.height = settings.videoHeight;
    this.instructionsPerFrame = this.calculateInstructionsPerFrame();
  }

  private setupInputListeners(): void {
    this.input.setupListeners();
  }

  // ─── Program Load ─────────────────────────────────────────────────

  public async loadAndRun(projectPath: string): Promise<void> {
    if (this.isLoading) { this.log('Already loading a project', 'warn'); return; }
    this.isLoading = true;
    const api = (window as any).electronAPI;
    if (!api) {
      this.log('No Electron API', 'error');
      this.isLoading = false;
      return;
    }
    try {
      this.log(`Loading project from ${projectPath}`, 'info');
      const normalized = projectPath.replace(/\\/g, '/');
      this.projectDir = normalized.substring(0, normalized.lastIndexOf('/'));
      const code = await api.readFile(projectPath);

      const compiler = new Compiler(this.logFn);
      compiler.setModuleLoader((name: string) => {
        try {
          const api = (window as any).electronAPI;
          if (api && api.readFileSync) {
            const p = this.projectDir + '/lib/' + name + '.okzlib';
            try {
              const code = api.readFileSync(p);
              if (code !== null && code !== undefined) return code;
            } catch {}
          }
        } catch {}
        return null;
      });
      const bytecode = compiler.compile(code);

      if (!bytecode) {
        this.error.throw('Compilation failed');
        this.isLoading = false;
        return;
      }

      this.log(`Compiled ${bytecode.instructions.length} instructions`, 'info');

      // Reset subsystems
      this.input.removeListeners();
      this.input.setupListeners();
      this.clock.reset();
      this.audio.stopAll();
      this.scheduler.clear();
      this.rcmd.clear();

      // Create process
      this.mainProcess = new Process(1, 'main', bytecode);
      this.mainProcess.context = this;
      this.mainProcess.globals = {};
      this.scheduler.addProcess(this.mainProcess);

      // Keep interpreter reference for legacy compat
      this.interpreter.process = this.mainProcess;
      this.interpreter.syncRequested = false;

      // Register native API
      this.registerNativeAPI();

      this.isRunning = true;
      this.transitionState(VMState.Running);
      this.isLoading = false;
    } catch (err: any) {
      this.log(`Failed to load: ${err.message}`, 'error');
      this.isRunning = false;
      this.transitionState(VMState.Shutdown);
      this.isLoading = false;
    }
  }

  // ─── Main Tick (layered) ──────────────────────────────────────────

  public tick(): void {
    if (this.state === VMState.Shutdown) return;

    // FPS limiter — process input only on actual frames
    const now = performance.now();
    const frameInterval = 1000 / this.settings.fpsLimit;
    if (now - this.lastFrameTick < frameInterval) return;
    this.lastFrameTick = now;

    // === LAYER 1: Input processing ===
    this.input.processFrame();

    // === LAYER 2: Frame time ===
    this.clock.tickFrame();

    // === LAYER 3: Execution (Scheduler) ===
    if (this.state === VMState.Running) {
      this.clock.tickScheduler();
      this.executeProcesses();
    }

    // === LAYER 4: Flush render commands → framebuffer + present ===
    this.rcmd.flush(this.graphics.fb, this.graphics.width, this.graphics.height);
    this.presenter.present(this.graphics.fb, this.graphics.width, this.graphics.height);
    this.fpsCounter++;

    this.updateMetrics();
  }

  private executeProcesses(): void {
    this.scheduler.yieldCheck = () => this.interpreter.syncRequested;
    const executed = this.scheduler.runQuantum(this.instructionsPerFrame, this.clock.elapsedTime);
    this.interpreter.syncRequested = false;
    this.scheduler.yieldCheck = null;
    this.tickCount += executed;
  }

  // ─── Metrics ──────────────────────────────────────────────────────

  private updateMetrics(): void {
    const elapsed = performance.now();
    this.cpu.currentLoad = this.tickCount > 0
      ? Math.min(100, (this.instructionsPerSecond / (this.settings.cpuFrequency * 1e6)) * 100)
      : 0;

    const now = Date.now();
    if (now - this.fpsTimer >= 1000) {
      this.currentFps = this.fpsCounter;
      this.instructionsPerSecond = this.tickCount - this.lastTickCount;
      this.gpuCommandsPerSecond = this.rcmd.commandCount - this.lastGpuCount;
      this.lastTickCount = this.tickCount;
      this.lastGpuCount = this.rcmd.commandCount;
      this.fpsCounter = 0;
      this.fpsTimer = now;
    }
  }

  // ─── Stop / Shutdown ──────────────────────────────────────────────

  public stop(): void {
    this.isRunning = false;
    this.isLoading = false;
    this.transitionState(VMState.Shutdown);
    this.interpreter.reset();
    this.input.removeListeners();
    this.audio.stopAll();
    this.clock.clearTimers();
    this.scheduler.clear();
    this.rcmd.clear();
    this.mainProcess = null;
    this.tickCount = 0;
    this.lastTickCount = 0;
    this.lastGpuCount = 0;
  }

  // ─── Debug Info ───────────────────────────────────────────────────

  public getDebugInfo(): VMDebugInfo {
    const proc = this.mainProcess;
    let ramUsage = 0;
    let allocatedObjects = 0;
    if (proc) {
      const visited = new Set<any>();
      const scan = (v: Value) => {
        if (!v || visited.has(v)) return;
        visited.add(v);
        allocatedObjects++;
        switch (v.type) {
          case 'nil': ramUsage += 8; break;
          case 'boolean': ramUsage += 8; break;
          case 'number': ramUsage += 16; break;
          case 'string': ramUsage += 32 + v.value.length * 2; break;
          case 'function': ramUsage += 64; break;
          case 'native': ramUsage += 8; break;
          case 'table':
            ramUsage += 64;
            for (const k of Object.keys(v.value)) {
              ramUsage += k.length * 2 + 16;
              scan(v.value[k]);
            }
            break;
          case 'array':
            ramUsage += 64;
            for (const el of v.value) scan(el);
            break;
          case 'object':
            ramUsage += 64;
            for (const k of Object.keys(v.value)) {
              ramUsage += k.length * 2 + 16;
              scan(v.value[k]);
            }
            break;
        }
      };
      for (const v of proc.stack) scan(v);
      for (const v of proc.locals) scan(v);
      for (const k of Object.keys(proc.globals)) {
        ramUsage += k.length * 2 + 16;
        scan(proc.globals[k]);
      }
      for (const f of proc.frames) {
        for (const v of f.locals) scan(v);
      }
    }
    return {
      cpuUsage: this.cpu.currentLoad,
      ramUsage,
      ramTotal: this.ram.total,
      allocatedObjects,
      instructionsPerSecond: this.instructionsPerSecond,
      fps: this.currentFps,
      processCount: this.mainProcess && !this.mainProcess.halted ? 1 : 0,
      gpuCommandsPerSecond: this.gpuCommandsPerSecond,
    };
  }

  public log(msg: string, type: string = 'info'): void {
    this.logFn(msg, type);
  }

  public get ctx2d(): CanvasRenderingContext2D {
    return this.ctx;
  }

  // ─── Native API Helpers ───────────────────────────────────────────

  private nil(): Value { return { type: 'nil' }; }
  private num(v: number): Value { return { type: 'number', value: v }; }
  private bool(v: boolean): Value { return { type: 'boolean', value: v }; }
  private str(v: string): Value { return { type: 'string', value: v }; }

  private getProcStack(): Value[] {
    return this.mainProcess?.stack || [];
  }

  private popNum(): number {
    const s = this.getProcStack();
    const v = s.pop() || this.nil();
    return v.type === 'number' ? v.value : 0;
  }

  private popStr(): string {
    const s = this.getProcStack();
    const v = s.pop() || this.nil();
    return v.type === 'string' ? v.value : '';
  }

  private popBool(): boolean {
    const s = this.getProcStack();
    const v = s.pop() || this.nil();
    return v.type === 'boolean' ? v.value : false;
  }

  // ─── Math Vectors ──────────────────────────────────────────────────

  private mathVec2(x: number, y: number): Value {
    const self = this;
    return {
      type: 'table', value: {
        x: self.num(x), y: self.num(y),
        length: { type: 'native', value: (vm: VMCore) => { const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; return vm.num(Math.sqrt(sx*sx + sy*sy)); }},
        add: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; return vm.mathVec2(sx+ox, sy+oy); }},
        sub: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; return vm.mathVec2(sx-ox, sy-oy); }},
        scale: { type: 'native', value: (vm: VMCore) => { const f = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const factor = f.type === 'number' ? f.value : 1; return vm.mathVec2(sx*factor, sy*factor); }},
        dot: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; return vm.num(sx*ox + sy*oy); }},
        normalize: { type: 'native', value: (vm: VMCore) => { const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const len = Math.sqrt(sx*sx + sy*sy); return len === 0 ? vm.mathVec2(0,0) : vm.mathVec2(sx/len, sy/len); }},
        distance: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; const dx = sx-ox; const dy = sy-oy; return vm.num(Math.sqrt(dx*dx + dy*dy)); }},
      }
    };
  }

  private mathVec3(x: number, y: number, z: number): Value {
    const self = this;
    return {
      type: 'table', value: {
        x: self.num(x), y: self.num(y), z: self.num(z),
        length: { type: 'native', value: (vm: VMCore) => { const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; return vm.num(Math.sqrt(sx*sx + sy*sy + sz*sz)); }},
        add: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; const oz = (o as any).value?.z?.value ?? 0; return vm.mathVec3(sx+ox, sy+oy, sz+oz); }},
        sub: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; const oz = (o as any).value?.z?.value ?? 0; return vm.mathVec3(sx-ox, sy-oy, sz-oz); }},
        scale: { type: 'native', value: (vm: VMCore) => { const f = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const factor = f.type === 'number' ? f.value : 1; return vm.mathVec3(sx*factor, sy*factor, sz*factor); }},
        dot: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; const oz = (o as any).value?.z?.value ?? 0; return vm.num(sx*ox + sy*oy + sz*oz); }},
        cross: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; const oz = (o as any).value?.z?.value ?? 0; return vm.mathVec3(sy*oz - sz*oy, sz*ox - sx*oz, sx*oy - sy*ox); }},
        normalize: { type: 'native', value: (vm: VMCore) => { const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const len = Math.sqrt(sx*sx + sy*sy + sz*sz); return len === 0 ? vm.mathVec3(0,0,0) : vm.mathVec3(sx/len, sy/len, sz/len); }},
        distance: { type: 'native', value: (vm: VMCore) => { const o = vm.getProcStack().pop(); const s = vm.getProcStack().pop(); const sx = (s as any).value?.x?.value ?? 0; const sy = (s as any).value?.y?.value ?? 0; const sz = (s as any).value?.z?.value ?? 0; const ox = (o as any).value?.x?.value ?? 0; const oy = (o as any).value?.y?.value ?? 0; const oz = (o as any).value?.z?.value ?? 0; const dx = sx-ox; const dy = sy-oy; const dz = sz-oz; return vm.num(Math.sqrt(dx*dx + dy*dy + dz*dz)); }},
      }
    };
  }

  // ─── Native API Registration ──────────────────────────────────────

  private registerNativeAPI(): void {
    const proc = this.mainProcess;
    if (!proc) return;
    registerNativeAPI(this, proc.globals);
  }
}