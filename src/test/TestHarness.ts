import { Lexer } from '../compiler/lexer/Lexer';
import { Parser } from '../compiler/parser/Parser';
import { Compiler } from '../compiler/compiler/Compiler';
import { Value, BytecodeChunk, CallFrame } from '../vm/types';

export interface TestEvent {
  type: string;
  pc: number;
  opcode: string;
  operands: number[];
  stackBefore: string[];
  stackAfter: string[];
  stackDelta: number;
  timestamp: number;
}

export interface TestWarning {
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  message: string;
  pc?: number;
  instruction?: string;
  details?: any;
}

export interface TestReport {
  source: string;
  sourceLines: number;
  compileTime: number;
  executionTime: number;
  totalInstructions: number;
  maxStackDepth: number;
  finalStackDepth: number;
  status: 'ok' | 'halted' | 'error' | 'timeout';
  warnings: TestWarning[];
  events: TestEvent[];
  bytecode: BytecodeChunk;
  opcodeFrequency: Record<string, number>;
  nativeCalls: Record<string, number>;
  globalsRead: Record<string, number>;
  globalsWritten: Record<string, number>;
  stackDepthOverTime: number[];
  frames: number;
  maxCallDepth: number;
}

type NativeCallback = (...args: Value[]) => Value;

export class TestHarness {
  private report: TestReport;
  private warnings: TestWarning[];
  private events: TestEvent[];

  private stack: Value[] = [];
  private locals: Value[] = [];
  private globals: Record<string, Value> = {};
  private frames: CallFrame[] = [];
  private pc: number = 0;
  private chunk: BytecodeChunk | null = null;
  private halted: boolean = false;

  private nativeTable: Record<string, Record<string, NativeCallback>> = {};
  private directNatives: Record<string, NativeCallback> = {};

  private startTime: number = 0;
  private maxStack: number = 0;
  private stackSnapshots: number[] = [];
  private opcodeCount: Record<string, number> = {};
  private nativeCallCount: Record<string, number> = {};
  private globalReads: Record<string, number> = {};
  private globalWrites: Record<string, number> = {};
  private callDepth: number = 0;
  private maxCallDepth: number = 0;
  private executedInstructions: number = 0;
  private trace: boolean;

  constructor(trace: boolean = false) {
    this.trace = trace;
    this.report = this.emptyReport();
    this.warnings = [];
    this.events = [];
  }

  private emptyReport(): TestReport {
    return {
      source: '',
      sourceLines: 0,
      compileTime: 0,
      executionTime: 0,
      totalInstructions: 0,
      maxStackDepth: 0,
      finalStackDepth: 0,
      status: 'ok',
      warnings: [],
      events: [],
      bytecode: { instructions: [], constants: [], globals: [] },
      opcodeFrequency: {},
      nativeCalls: {},
      globalsRead: {},
      globalsWritten: {},
      stackDepthOverTime: [],
      frames: 0,
      maxCallDepth: 0,
    };
  }

  private warn(severity: TestWarning['severity'], category: string, message: string, pc?: number, details?: any): void {
    this.warnings.push({ severity, category, message, pc, instruction: pc !== undefined && this.chunk ? this.chunk.instructions[pc]?.opcode : undefined, details });
  }

  private record(pc: number, opcode: string, operands: number[], before: Value[], after: Value[]): void {
    if (!this.trace) return;
    this.events.push({
      type: 'exec',
      pc,
      opcode,
      operands,
      stackBefore: before.map(v => this.valShort(v)),
      stackAfter: after.map(v => this.valShort(v)),
      stackDelta: after.length - before.length,
      timestamp: Date.now() - this.startTime,
    });
  }

  compile(source: string, moduleLoader?: (name: string) => string | null): TestReport {
    this.startTime = Date.now();
    const startCompile = Date.now();
    this.report.source = source;
    this.report.sourceLines = source.split('\n').length;

    const compiler = new Compiler((msg: string, type?: string) => {});
    if (moduleLoader) {
      compiler.setModuleLoader(moduleLoader);
    }

    const bytecode = compiler.compile(source);
    if (!bytecode) {
      this.report.status = 'error';
      this.warn('critical', 'compile', 'Compilation returned null');
      return this.finalize();
    }

    this.report.compileTime = Date.now() - startCompile;
    this.report.bytecode = bytecode;
    return this.report;
  }

  addNativeTable(name: string, methods: Record<string, NativeCallback>): void {
    this.nativeTable[name] = methods;
  }

  addDirectNative(name: string, callback: NativeCallback): void {
    this.directNatives[name] = callback;
  }

  setupDefaultNatives(): void {
    this.addDirectNative('print', (...args: Value[]) => {
      const val = args[0];
      const str = this.valueToString(val);
      this.report.source += '\n-- PRINT: ' + str;
      return val;
    });

    this.addNativeTable('screen', {
      clear: () => ({ type: 'nil' }),
      color: () => ({ type: 'nil' }),
      pixel: () => ({ type: 'nil' }),
      line: () => ({ type: 'nil' }),
      rect: () => ({ type: 'nil' }),
      circle: () => ({ type: 'nil' }),
      text: () => ({ type: 'nil' }),
      sync: () => ({ type: 'nil' }),
      width: () => ({ type: 'number', value: 800 }),
      height: () => ({ type: 'number', value: 600 }),
    });

    this.addNativeTable('math', {
      cos: (...args: Value[]) => ({ type: 'number', value: Math.cos(this.numVal(args[0])) }),
      sin: (...args: Value[]) => ({ type: 'number', value: Math.sin(this.numVal(args[1])) }),
      abs: (...args: Value[]) => ({ type: 'number', value: Math.abs(this.numVal(args[0])) }),
      floor: (...args: Value[]) => ({ type: 'number', value: Math.floor(this.numVal(args[0])) }),
      ceil: (...args: Value[]) => ({ type: 'number', value: Math.ceil(this.numVal(args[0])) }),
      sqrt: (...args: Value[]) => ({ type: 'number', value: Math.sqrt(this.numVal(args[0])) }),
      max: (...args: Value[]) => ({ type: 'number', value: Math.max(this.numVal(args[0]), this.numVal(args[1])) }),
      min: (...args: Value[]) => ({ type: 'number', value: Math.min(this.numVal(args[0]), this.numVal(args[1])) }),
      vec2: (...args: Value[]) => ({ type: 'table', value: { x: args[0], y: args[1] } }),
      vec3: (...args: Value[]) => ({ type: 'table', value: { x: args[0], y: args[1], z: args[2] } }),
    });

    this.addNativeTable('mouse', {
      x: () => ({ type: 'number', value: 0 }),
      y: () => ({ type: 'number', value: 0 }),
      deltaX: () => ({ type: 'number', value: 0 }),
      deltaY: () => ({ type: 'number', value: 0 }),
      left: () => ({ type: 'boolean', value: false }),
      right: () => ({ type: 'boolean', value: false }),
      locked: () => ({ type: 'boolean', value: true }),
    });

    this.addNativeTable('keyboard', {
      isPressed: () => ({ type: 'boolean', value: false }),
      justPressed: () => ({ type: 'boolean', value: false }),
      justReleased: () => ({ type: 'boolean', value: false }),
    });

    this.addNativeTable('system', {
      deltaTime: () => ({ type: 'number', value: 0.016 }),
      elapsedTime: (vm?: any) => ({ type: 'number', value: 1.0 }),
      fps: () => ({ type: 'number', value: 60 }),
      fpsLimit: (...args: Value[]) => ({ type: 'number', value: this.numVal(args[0]) > 0 ? this.numVal(args[0]) : 60 }),
      frameCount: () => ({ type: 'number', value: 1 }),
      log: () => ({ type: 'nil' }),
    });

    this.addNativeTable('audio', {
      tone: () => ({ type: 'nil' }),
      note: () => ({ type: 'nil' }),
      play: () => ({ type: 'nil' }),
      stop: () => ({ type: 'nil' }),
      volume: (...args: Value[]) => ({ type: 'number', value: 1 }),
      stopAll: () => ({ type: 'nil' }),
    });

    this.addNativeTable('save', {
      write: () => ({ type: 'nil' }),
      read: () => ({ type: 'nil' }),
      exists: () => ({ type: 'boolean', value: false }),
      delete: () => ({ type: 'nil' }),
    });

    this.addNativeTable('event', {
      on: () => ({ type: 'nil' }),
      emit: () => ({ type: 'nil' }),
    });

    this.addDirectNative('tonumber', (...args: Value[]) => {
      const val = args[0];
      if (val.type === 'number') return val;
      if (val.type === 'string') {
        const n = Number(val.value);
        return isNaN(n) ? { type: 'nil' } : { type: 'number', value: n };
      }
      return { type: 'nil' };
    });

    this.addDirectNative('tostring', (...args: Value[]) => {
      return { type: 'string', value: this.valueToString(args[0]) };
    });

    // Iterator support for generic for
    this.addDirectNative('pairs', (...args: Value[]) => {
      const tbl = args[0];
      if (!tbl || (tbl.type !== 'table' && tbl.type !== 'array')) return { type: 'nil' };
      const keys = Object.keys(tbl.value).sort((a, b) => {
        const na = Number(a); const nb = Number(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return a.localeCompare(b);
      });
      let idx = 0;
      const self = this;
      return {
        type: 'native', value: (...innerArgs: Value[]) => {
          if (idx >= keys.length) return { type: 'nil' };
          const key = keys[idx++];
          const numKey = Number(key);
          const k = !isNaN(numKey) ? { type: 'number', value: numKey } : { type: 'string', value: key };
          const v = tbl.value[key] || { type: 'nil' };
          return { type: 'array', value: [k, v] };
        }
      } as any;
    });

    this.addDirectNative('ipairs', (...args: Value[]) => {
      const tbl = args[0];
      if (!tbl || (tbl.type !== 'table' && tbl.type !== 'array')) return { type: 'nil' };
      let idx = 1;
      const maxIdx = tbl.type === 'array' ? tbl.value.length : Math.max(...Object.keys(tbl.value).map(Number).filter(n => !isNaN(n)));
      return {
        type: 'native', value: (...innerArgs: Value[]) => {
          if (idx > maxIdx) return { type: 'nil' };
          const i = idx;
          const v = tbl.value[i] || { type: 'nil' };
          idx++;
          return { type: 'array', value: [{ type: 'number', value: i }, v] };
        }
      } as any;
    });

    this.addNativeTable('table', {
      keys: (...args: Value[]) => {
        const tbl = args[0];
        if (!tbl || (tbl.type !== 'table' && tbl.type !== 'array')) return { type: 'array', value: [] };
        const keys = Object.keys(tbl.value);
        const result: Value[] = [];
        for (const k of keys) {
          const n = Number(k);
          result.push(!isNaN(n) ? { type: 'number', value: n } : { type: 'string', value: k });
        }
        return { type: 'array', value: result };
      },
      insert: () => ({ type: 'nil' }),
      remove: () => ({ type: 'nil' }),
      sort: () => ({ type: 'nil' }),
    });
  }

  execute(maxInstructions: number = 500000): TestReport {
    if (!this.report.bytecode.instructions.length) {
      this.warn('critical', 'exec', 'No bytecode to execute');
      return this.finalize();
    }

    this.chunk = this.report.bytecode;
    this.stack = [];
    this.locals = [];
    this.globals = {};
    this.frames = [];
    this.pc = 0;
    this.halted = false;
    this.executedInstructions = 0;
    this.maxStack = 0;
    this.callDepth = 0;
    this.maxCallDepth = 0;
    this.opcodeCount = {};
    this.nativeCallCount = {};
    this.globalReads = {};
    this.globalWrites = {};
    this.stackSnapshots = [];

    this.startTime = Date.now();

    this.registerNatives();

    try {
      while (this.executedInstructions < maxInstructions) {
        if (this.halted || !this.chunk || this.pc >= this.chunk.instructions.length) {
          if (!this.halted) {
            this.halted = true;
            this.warn('low', 'exec', 'Program counter exceeded instruction count (no HALT)');
          }
          break;
        }

        const currentPc = this.pc;
        const instr = this.chunk.instructions[currentPc];
        const opcode = instr.opcode;
        const ops = instr.operands;

        this.opcodeCount[opcode] = (this.opcodeCount[opcode] || 0) + 1;
        this.executedInstructions++;

        // pc++ BEFORE dispatch (matching real interpreter behavior)
        this.pc = currentPc + 1;

        const before = this.trace ? [...this.stack] : [];
        const result = this.execStep(opcode, ops);
        const after = this.trace ? [...this.stack] : [];

        this.record(currentPc, opcode, ops, before, after);

        if (this.stack.length > this.maxStack) {
          this.maxStack = this.stack.length;
        }

        if (this.executedInstructions % 1000 === 0) {
          this.stackSnapshots.push(this.stack.length);
        }

        if (result === false) {
          this.halted = true;
          break;
        }
      }

      if (this.executedInstructions >= maxInstructions) {
        this.report.status = 'timeout';
        this.warn('high', 'exec', `Execution timed out after ${maxInstructions} instructions`);
      } else if (this.halted) {
        this.report.status = 'halted';
      }
    } catch (err: any) {
      this.report.status = 'error';
      this.warn('critical', 'exec', `Runtime error: ${err.message}`, this.pc, { error: err.stack });
    }

    this.report.executionTime = Date.now() - this.startTime;
    this.report.totalInstructions = this.executedInstructions;
    this.report.maxStackDepth = this.maxStack;
    this.report.finalStackDepth = this.stack.length;
    this.report.frames = this.frames.length;
    this.report.maxCallDepth = this.maxCallDepth;
    this.report.opcodeFrequency = this.opcodeCount;
    this.report.nativeCalls = this.nativeCallCount;
    this.report.globalsRead = this.globalReads;
    this.report.globalsWritten = this.globalWrites;
    this.report.stackDepthOverTime = this.stackSnapshots;

    this.runStaticAnalysis();

    this.report.warnings = this.warnings;
    this.report.events = this.events;
    return this.finalize();
  }

  private registerNatives(): void {
    for (const [name, methods] of Object.entries(this.nativeTable)) {
      const tableVal: Record<string, Value> = {};
      for (const [method, callback] of Object.entries(methods)) {
        tableVal[method] = { type: 'native', value: callback as any };
      }
      this.globals[name] = { type: 'table', value: tableVal };
    }
    for (const [name, callback] of Object.entries(this.directNatives)) {
      this.globals[name] = { type: 'native', value: callback as any };
    }
  }

  private execStep(opcode: string, ops: number[]): boolean {
    switch (opcode) {
      case 'NOP': return true;

      case 'PUSH':
        this.push(this.getConst(ops[0]));
        return true;

      case 'POP':
        if (ops.length > 0) {
          this.setLocal(ops[0], this.pop());
        } else {
          this.pop();
        }
        return true;

      case 'ADD': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.numberVal(this.numVal(a) + this.numVal(b)));
        return true;
      }

      case 'SUB': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.numberVal(this.numVal(a) - this.numVal(b)));
        return true;
      }

      case 'MUL': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.numberVal(this.numVal(a) * this.numVal(b)));
        return true;
      }

      case 'DIV': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.numberVal(this.numVal(a) / this.numVal(b)));
        return true;
      }

      case 'MOD': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.numberVal(this.numVal(a) % this.numVal(b)));
        return true;
      }

      case 'CONCAT': {
        const b = this.pop();
        const a = this.pop();
        const sa = a.type === 'string' ? a.value : this.valueToString(a);
        const sb = b.type === 'string' ? b.value : this.valueToString(b);
        this.push({ type: 'string', value: sa + sb });
        return true;
      }

      case 'LEN': {
        const v = this.pop();
        if (v.type === 'string') this.push(this.numberVal(v.value.length));
        else if (v.type === 'array') this.push(this.numberVal(v.value.length));
        else if (v.type === 'table') this.push(this.numberVal(Object.keys(v.value).length));
        else this.push(this.numberVal(0));
        return true;
      }

      case 'NEG':
        this.push(this.numberVal(-this.numVal(this.pop())));
        return true;

      case 'EQ': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.valuesEqual(a, b)));
        return true;
      }

      case 'NEQ': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(!this.valuesEqual(a, b)));
        return true;
      }

      case 'LT': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.numVal(a) < this.numVal(b)));
        return true;
      }

      case 'GT': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.numVal(a) > this.numVal(b)));
        return true;
      }

      case 'LTE': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.numVal(a) <= this.numVal(b)));
        return true;
      }

      case 'GTE': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.numVal(a) >= this.numVal(b)));
        return true;
      }

      case 'AND': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.truthy(a) && this.truthy(b)));
        return true;
      }

      case 'OR': {
        const b = this.pop();
        const a = this.pop();
        this.push(this.boolVal(this.truthy(a) || this.truthy(b)));
        return true;
      }

      case 'NOT':
        this.push(this.boolVal(!this.truthy(this.pop())));
        return true;

      case 'JMP':
        this.pc = ops[0];
        return true;

      case 'JZ': {
        const cond = this.pop();
        if (!this.truthy(cond)) this.pc = ops[0];
        return true;
      }

      case 'JNZ': {
        const cond = this.pop();
        if (this.truthy(cond)) this.pc = ops[0];
        return true;
      }

      case 'CALL': {
        const argCount = ops[0];
        const nvals = ops[1] || 1;
        const fnVal = this.stack[this.stack.length - 1 - argCount];
        if (fnVal.type === 'native') {
          this.stack.splice(this.stack.length - 1 - argCount, 1);
          const args = this.stack.splice(this.stack.length - argCount, argCount);
          const result = fnVal.value(...args);
          this.push(result);
          this.nativeCallCount['<native>'] = (this.nativeCallCount['<native>'] || 0) + 1;
        } else if (fnVal.type === 'number') {
          const addr = fnVal.value;
          this.stack.splice(this.stack.length - 1 - argCount, argCount + 1);
          this.frames.push({ pc: this.pc, sp: this.stack.length - 1, locals: this.locals.slice(), name: 'func', nvals: 1 });
          this.pc = addr;
          this.locals = [];
          this.callDepth++;
          this.maxCallDepth = Math.max(this.maxCallDepth, this.callDepth);
        } else if (fnVal.type === 'function') {
          const func = fnVal.value;
          this.stack.splice(this.stack.length - 1 - argCount, argCount + 1);
          this.frames.push({ pc: this.pc, sp: this.stack.length - 1, locals: this.locals.slice(), name: func.name, nvals });
          this.pc = func.address;
          this.locals = [];
          this.callDepth++;
          this.maxCallDepth = Math.max(this.maxCallDepth, this.callDepth);
        } else {
          this.stack.splice(this.stack.length - 1 - argCount, argCount + 1);
          this.push(this.nilVal());
        }
        return true;
      }

      case 'RET': {
        const returnCount = ops[0] || 1;
        const returnVals: Value[] = [];
        for (let i = 0; i < returnCount; i++) {
          returnVals.unshift(this.pop());
        }
        const frame = this.frames.pop();
        if (!frame) {
          this.halted = true;
          return false;
        }
        this.pc = frame.pc;
        this.locals = frame.locals;
        this.stack = this.stack.slice(0, frame.sp + 1);
        for (const rv of returnVals) this.push(rv);
        this.callDepth--;
        return true;
      }

      case 'LOAD':
        this.push(this.getLocal(ops[0]));
        return true;

      case 'STORE':
        this.setLocal(ops[0], this.pop());
        return true;

      case 'LOAD_GLOBAL': {
        const gname = this.chunk!.globals[ops[0]];
        this.globalReads[gname] = (this.globalReads[gname] || 0) + 1;
        this.push(this.globals[gname] || this.nilVal());
        return true;
      }

      case 'STORE_GLOBAL': {
        const gname = this.chunk!.globals[ops[0]];
        this.globalWrites[gname] = (this.globalWrites[gname] || 0) + 1;
        this.globals[gname] = this.pop();
        return true;
      }

      case 'NEW_TABLE':
        this.push({ type: 'table', value: {} });
        return true;

      case 'NEW_ARRAY':
        this.push({ type: 'array', value: [] });
        return true;

      case 'INDEX_GET': {
        const key = this.pop();
        const obj = this.pop();
        this.push(this.indexGet(obj, key));
        return true;
      }

      case 'INDEX_SET': {
        const key = this.pop();
        const obj = this.pop();
        const val = this.pop();
        this.indexSet(obj, key, val);
        this.push(val);
        return true;
      }

      case 'LOAD_CONST':
        this.push(this.getConst(ops[0]));
        return true;

      case 'NEW_STRING':
        this.push({ type: 'string', value: this.chunk!.constants[ops[0]] as any as string || '' });
        return true;

      case 'NEW_NUMBER':
        this.push({ type: 'number', value: (this.chunk!.constants[ops[0]] as any as number) || 0 });
        return true;

      case 'NEW_BOOL':
        this.push({ type: 'boolean', value: ops[0] !== 0 });
        return true;

      case 'NEW_NIL':
        this.push(this.nilVal());
        return true;

      case 'DUP': {
        const v = this.pop();
        this.push(v);
        this.push(v);
        return true;
      }

      case 'SWAP': {
        const a = this.pop();
        const b = this.pop();
        this.push(a);
        this.push(b);
        return true;
      }

      case 'PRINT': {
        const val = this.pop();
        this.warn('low', 'print', `PRINT: ${this.valueToString(val)}`, this.pc);
        return true;
      }

      case 'MAKE_FUNCTION': {
        const addrConst = this.getConst(ops[0]);
        const nameConst = this.getConst(ops[1]);
        const funcAddr = (addrConst as any)?.value ?? ops[0];
        const funcName = (nameConst as any)?.value ?? `fn_${ops[0]}`;
        const funcLocals = ops[2] || 0;
        this.push({
          type: 'function',
          value: {
            name: funcName,
            address: funcAddr,
            arity: funcLocals,
            locals: funcLocals,
          },
        });
        return true;
      }

      case 'HALT': {
        this.halted = true;
        return false;
      }

      case 'MULTI_RET': {
        const desired = ops[0] || 1;
        const nvals = ops[1] || 1;
        const excess = nvals - desired;
        if (excess > 0) {
          this.stack.splice(this.stack.length - excess, excess);
        }
        return true;
      }

      case 'FOR_IN': {
        const iteratorFn = this.pop();
        const state = this.pop();
        const initial = this.pop();
        this.push(initial);
        this.push(state);
        this.push(iteratorFn);
        return true;
      }

      case 'FOR_IN_NEXT': {
        const varCount = ops[0] || 1;
        const exitAddr = ops[1] || 0;
        const iteratorFn = this.stack[this.stack.length - 1];
        const state = this.stack[this.stack.length - 2];
        const control = this.stack[this.stack.length - 3];
        if (iteratorFn.type === 'native' || iteratorFn.type === 'function') {
          this.push(control);
          this.push(state);
          this.push(iteratorFn);
          if (iteratorFn.type === 'native') {
            const result = iteratorFn.value(...[control, state]);
            if (result.type === 'nil') {
              this.stack.splice(this.stack.length - 5, 5);
              this.pc = exitAddr;
            } else {
              this.stack.splice(this.stack.length - 5, 5);
              this.push(result);
              for (let i = 1; i < varCount; i++) this.push(this.nilVal());
            }
          } else {
            const removed = this.stack.splice(this.stack.length - 3, 3);
            this.frames.push({ pc: this.pc, sp: this.stack.length - 1, locals: this.locals.slice(), name: 'for_in_next', nvals: varCount });
            this.pc = iteratorFn.value.address;
            this.locals = [];
          }
        } else {
          this.stack.splice(this.stack.length - 3, 3);
          this.pc = exitAddr;
        }
        return true;
      }

      case 'CALL_PROTECTED': {
        const argCount = ops[0];
        const fnVal = this.stack[this.stack.length - 1 - argCount];
        if (fnVal.type === 'native') {
          try {
            this.stack.splice(this.stack.length - 1 - argCount, 1);
            const args = this.stack.splice(this.stack.length - argCount, argCount);
            const result = fnVal.value(...args);
            this.push(this.boolVal(true));
            this.push(result);
          } catch (e: any) {
            this.stack.splice(this.stack.length - argCount, argCount);
            this.push(this.boolVal(false));
            this.push({ type: 'string', value: e?.message || 'unknown error' });
          }
        } else if (fnVal.type === 'function') {
          const func = fnVal.value;
          this.stack.splice(this.stack.length - 1 - argCount, argCount + 1);
          this.frames.push({ pc: this.pc, sp: this.stack.length - 1, locals: this.locals.slice(), name: func.name, nvals: 1 });
          this.pc = func.address;
          this.locals = [];
          this.callDepth++;
          this.maxCallDepth = Math.max(this.maxCallDepth, this.callDepth);
        } else {
          this.stack.splice(this.stack.length - 1 - argCount, argCount + 1);
          this.push(this.boolVal(true));
          this.push(this.nilVal());
        }
        return true;
      }

      default:
        this.warn('medium', 'exec', `Unimplemented opcode in test harness: ${opcode}`, this.pc);
        return true;
    }
  }

  private runStaticAnalysis(): void {
    const bc = this.report.bytecode;
    if (!bc.instructions.length) return;

    // Build jump targets
    const jumpTargets = new Set<number>();
    for (const instr of bc.instructions) {
      if (['JMP', 'JZ', 'JNZ'].includes(instr.opcode)) {
        jumpTargets.add(instr.operands[0]);
      }
    }
    // First instruction and instruction after JZ/JNZ are always reachable
    jumpTargets.add(0);
    for (let i = 0; i < bc.instructions.length; i++) {
      if (bc.instructions[i].opcode === 'JZ' || bc.instructions[i].opcode === 'JNZ') {
        jumpTargets.add(i + 1);
      }
    }

    // Basic-block aware stack analysis: only trace reachable instructions
    let simStack = 0;
    let maxSimStack = 0;

    for (let i = 0; i < bc.instructions.length; i++) {
      // If this instruction is not a jump target and the previous instruction
      // was an unconditional branch (JMP/HALT/RET), it's dead code — skip
      if (i > 0 && !jumpTargets.has(i)) {
        const prev = bc.instructions[i - 1].opcode;
        if (prev === 'JMP' || prev === 'HALT' || prev === 'RET') continue;
      }

      const instr = bc.instructions[i];
      const ops = instr.operands;

      switch (instr.opcode) {
        case 'PUSH': case 'LOAD_CONST': case 'NEW_STRING': case 'NEW_NUMBER':
        case 'NEW_BOOL': case 'NEW_NIL': case 'DUP': case 'LOAD': case 'LOAD_GLOBAL':
        case 'NEW_TABLE': case 'NEW_ARRAY': case 'INDEX_GET':
          simStack++; break;

        case 'POP':
          if (ops.length === 0) simStack = Math.max(0, simStack - 1); break;

        case 'STORE': case 'STORE_GLOBAL': case 'PRINT':
          simStack = Math.max(0, simStack - 1); break;

        case 'INDEX_SET':
          simStack = Math.max(0, simStack - 2); break;

        case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'MOD':
        case 'EQ': case 'NEQ': case 'LT': case 'GT': case 'LTE': case 'GTE':
        case 'AND': case 'OR': case 'CONCAT':
          simStack = Math.max(0, simStack - 1); break;

        case 'NEG': case 'NOT': case 'LEN': case 'SWAP':
          break;

        case 'CALL': {
          const argCount = ops[0];
          simStack = Math.max(0, simStack - argCount);
          break;
        }

        case 'RET': case 'JMP': case 'HALT':
          break;

        case 'JZ': case 'JNZ':
          simStack = Math.max(0, simStack - 1);
          break;

        case 'FOR_PREP': simStack = Math.max(0, simStack - 3); break;
        case 'FOR_LOOP': case 'TFOR_LOOP': case 'METHOD_CALL': break;
        case 'SET_LIST': simStack = Math.max(0, simStack - 2); break;
        case 'MAKE_FUNCTION': case 'CLOSURE': simStack++; break;
        case 'MULTI_RET': break;
        case 'FOR_IN': simStack = Math.max(0, simStack - 3); simStack += 3; break;
        case 'FOR_IN_NEXT': break;
        case 'CALL_PROTECTED': { const argCount = ops[0]; simStack = Math.max(0, simStack - argCount); break; }
        default: break;
      }

      maxSimStack = Math.max(maxSimStack, simStack);

      if (i > 0 && (instr.opcode === 'INDEX_SET') && (i + 1 >= bc.instructions.length || bc.instructions[i + 1].opcode !== 'POP')) {
        if (!this.isInFunctionBody(bc, i)) {
          this.warn('high', 'stack-leak', `INDEX_SET at pc ${i} without following POP — value leaked on stack`, i);
        }
      }
    }

    const jmps = bc.instructions.filter(i => ['JMP', 'JZ', 'JNZ'].includes(i.opcode));
    for (const jmp of jmps) {
      if (jmp.operands[0] >= bc.instructions.length) {
        this.warn('high', 'bytecode', `Jump target ${jmp.operands[0]} out of bounds (${bc.instructions.length} instructions)`);
      }
    }

    if (!bc.instructions.some(i => i.opcode === 'SCREEN_SYNC' || i.opcode === 'SYNC')) {
      const hasLoop = bc.instructions.filter(i => ['JMP', 'JZ', 'JNZ'].includes(i.opcode)).length > 3;
      if (hasLoop) {
        this.warn('medium', 'performance', 'Program contains loops but never calls screen.sync() — may run unbounded per frame', undefined, { loopCount: bc.instructions.filter(i => ['JMP', 'JZ', 'JNZ'].includes(i.opcode)).length });
      }
    }

    const nativeCalls = this.report.nativeCalls;
    const totalCalls = Object.values(nativeCalls).reduce((a, b) => a + b, 0);
    if (totalCalls > 0) {
      const nativeRatio = totalCalls / this.executedInstructions;
      if (nativeRatio > 0.5 && this.executedInstructions > 1000) {
        this.warn('medium', 'performance', `High native call ratio (${(nativeRatio * 100).toFixed(1)}% of instructions are native calls)`, undefined, { nativeCalls: totalCalls, totalInstructions: this.executedInstructions });
      }
    }

    if (this.maxStack > 1000) {
      this.warn('high', 'memory', `Stack grew to ${this.maxStack} values — possible leak`, undefined, { maxStackDepth: this.maxStack });
    }

    if (this.maxCallDepth > 50) {
      this.warn('high', 'recursion', `Call depth reached ${this.maxCallDepth} — possible infinite recursion`, undefined, { maxCallDepth: this.maxCallDepth });
    }

    this.report.maxStackDepth = Math.max(this.report.maxStackDepth, this.maxStack);
  }

  private isInFunctionBody(bc: BytecodeChunk, pc: number): boolean {
    let depth = 0;
    for (let i = 0; i <= pc; i++) {
      const instr = bc.instructions[i];
      if (instr.opcode === 'MAKE_FUNCTION' || instr.opcode === 'CLOSURE') depth++;
      if ((instr.opcode === 'RET' || instr.opcode === 'HALT') && depth > 0) depth--;
    }
    return depth > 0;
  }

  private finalize(): TestReport {
    this.report.warnings = this.warnings.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.severity] - order[b.severity];
    });
    return this.report;
  }

  formatReport(report?: TestReport): string {
    const r = report || this.report;
    const lines: string[] = [];
    lines.push('='.repeat(60));
    lines.push('OKZCODE TEST REPORT');
    lines.push('='.repeat(60));
    lines.push('');
    lines.push(`Source: ${r.sourceLines} lines, ${r.source.length} chars`);
    lines.push(`Compile: ${r.compileTime}ms`);
    lines.push(`Execute: ${r.executionTime}ms (${r.totalInstructions} instructions)`);
    lines.push(`Status: ${r.status.toUpperCase()}`);
    lines.push(`Max Stack Depth: ${r.maxStackDepth}`);
    lines.push(`Final Stack Depth: ${r.finalStackDepth}`);
    lines.push(`Max Call Depth: ${r.maxCallDepth}`);
    lines.push(`Bytecode: ${r.bytecode.instructions.length} instr, ${r.bytecode.constants.length} const, ${r.bytecode.globals.length} globals`);
    lines.push('');

    if (r.warnings.length > 0) {
      lines.push('-'.repeat(60));
      lines.push(`WARNINGS (${r.warnings.length})`);
      lines.push('-'.repeat(60));
      for (const w of r.warnings) {
        const tag = `[${w.severity.toUpperCase().padEnd(8)}]`;
        const pc = w.pc !== undefined ? ` @pc=${w.pc}` : '';
        lines.push(`${tag} ${w.category}: ${w.message}${pc}`);
      }
      lines.push('');
    }

    const sortedOps = Object.entries(r.opcodeFrequency).sort((a, b) => b[1] - a[1]);
    lines.push('-'.repeat(60));
    lines.push('OPCODE FREQUENCY (top 15)');
    lines.push('-'.repeat(60));
    for (const [op, count] of sortedOps.slice(0, 15)) {
      const pct = ((count / r.totalInstructions) * 100).toFixed(1);
      lines.push(`  ${op.padEnd(20)} ${String(count).padStart(8)} (${pct.padStart(5)}%)`);
    }
    lines.push('');

    if (Object.keys(r.nativeCalls).length > 0) {
      lines.push('-'.repeat(60));
      lines.push('NATIVE CALLS');
      lines.push('-'.repeat(60));
      for (const [name, count] of Object.entries(r.nativeCalls)) {
        lines.push(`  ${name}: ${count}`);
      }
      lines.push('');
    }

    if (Object.keys(r.globalsRead).length > 0) {
      lines.push('-'.repeat(60));
      lines.push('GLOBAL ACCESS');
      lines.push('-'.repeat(60));
      const allGlobals = new Set([...Object.keys(r.globalsRead), ...Object.keys(r.globalsWritten)]);
      for (const g of allGlobals) {
        const reads = r.globalsRead[g] || 0;
        const writes = r.globalsWritten[g] || 0;
        lines.push(`  ${g}: ${reads} reads, ${writes} writes`);
      }
      lines.push('');
    }

    if (r.stackDepthOverTime.length > 0) {
      lines.push('-'.repeat(60));
      lines.push('STACK DEPTH OVER TIME (sampled every 1000 instr)');
      lines.push('-'.repeat(60));
      const snapshots = r.stackDepthOverTime;
      const max = Math.max(...snapshots);
      const min = Math.min(...snapshots);
      const avg = snapshots.reduce((a, b) => a + b, 0) / snapshots.length;
      lines.push(`  Min: ${min}, Max: ${max}, Avg: ${avg.toFixed(1)}`);
      if (snapshots.length > 5) {
        const first = snapshots[0];
        const last = snapshots[snapshots.length - 1];
        const trend = last > first + 10 ? 'INCREASING (possible leak)' : last < first - 10 ? 'DECREASING' : 'STABLE';
        lines.push(`  Trend: ${trend} (${first} → ${last})`);
      }
      lines.push('');
    }

    if (r.bytecode.instructions.length <= 100) {
      lines.push('-'.repeat(60));
      lines.push('BYTECODE DISASSEMBLY');
      lines.push('-'.repeat(60));
      for (let i = 0; i < r.bytecode.instructions.length; i++) {
        const instr = r.bytecode.instructions[i];
        const ops = instr.operands.length > 0 ? ' ' + instr.operands.join(', ') : '';
        let comment = '';
        if (instr.opcode === 'LOAD_GLOBAL' || instr.opcode === 'STORE_GLOBAL') {
          comment = `  ; ${r.bytecode.globals[instr.operands[0]] || '?'}`;
        } else if (instr.opcode === 'PUSH' || instr.opcode === 'LOAD_CONST') {
          const c = r.bytecode.constants[instr.operands[0]];
          comment = `  ; ${c ? this.valShort(c) : '?'}`;
        }
        lines.push(`  ${String(i).padStart(4)}: ${instr.opcode.padEnd(16)}${ops}${comment}`);
      }
      lines.push('');
    }

    if (r.events.length > 0 && r.events.length <= 200) {
      lines.push('-'.repeat(60));
      lines.push('EXECUTION TRACE');
      lines.push('-'.repeat(60));
      for (const ev of r.events) {
        const delta = ev.stackDelta > 0 ? `+${ev.stackDelta}` : String(ev.stackDelta);
        lines.push(`  pc=${String(ev.pc).padStart(4)} ${ev.opcode.padEnd(16)} [${ev.stackBefore.join(', ').padEnd(30)}] → [${ev.stackAfter.join(', ').padEnd(30)}] Δ=${delta}`);
      }
    }

    lines.push('='.repeat(60));
    lines.push('END REPORT');
    lines.push('='.repeat(60));
    return lines.join('\n');
  }

  valShort(v: Value): string {
    switch (v.type) {
      case 'nil': return 'nil';
      case 'number': return String(v.value);
      case 'boolean': return v.value ? 'true' : 'false';
      case 'string': return `"${v.value.substring(0, 20)}"`;
      case 'table': return `{${Object.keys(v.value).length}}`;
      case 'array': return `[${v.value.length}]`;
      case 'function': return `fn<${v.value.address}>`;
      case 'native': return '<native>';
      default: return '?';
    }
  }

  private valueToString(v: Value): string {
    switch (v.type) {
      case 'nil': return 'nil';
      case 'number': return String(v.value);
      case 'boolean': return v.value ? 'true' : 'false';
      case 'string': return v.value;
      case 'table': return '{...}';
      case 'array': return '[...]';
      case 'function': return `function ${v.value.name}`;
      case 'native': return '<native>';
      default: return '?';
    }
  }

  private nilVal(): Value { return { type: 'nil' }; }
  private numberVal(value: number): Value { return { type: 'number', value }; }
  private boolVal(value: boolean): Value { return { type: 'boolean', value }; }
  private numVal(v: Value): number { return v.type === 'number' ? v.value : 0; }

  private truthy(v: Value): boolean {
    if (v.type === 'nil') return false;
    if (v.type === 'boolean') return v.value;
    if (v.type === 'number') return v.value !== 0;
    return true;
  }

  private valuesEqual(a: Value, b: Value): boolean {
    if (a.type !== b.type) return false;
    switch (a.type) {
      case 'nil': return true;
      case 'number': return a.value === (b as any).value;
      case 'boolean': return a.value === (b as any).value;
      case 'string': return a.value === (b as any).value;
      default: return a === b;
    }
  }

  private indexGet(obj: Value, key: Value): Value {
    if (obj.type === 'table') {
      const k = key.type === 'number' ? String(key.value) : (key.type === 'string' ? key.value : '');
      return obj.value[k] || this.nilVal();
    }
    if (obj.type === 'array') {
      if (key.type === 'number') return obj.value[key.value] || this.nilVal();
      if (key.type === 'string') return (obj.value as any)[key.value] || this.nilVal();
    }
    return this.nilVal();
  }

  private indexSet(obj: Value, key: Value, val: Value): void {
    if (obj.type === 'table') {
      const k = key.type === 'number' ? String(key.value) : (key.type === 'string' ? key.value : '');
      obj.value[k] = val;
    }
    if (obj.type === 'array') {
      if (key.type === 'number') {
        const idx = key.value;
        if (idx >= obj.value.length) obj.value.length = idx + 1;
        obj.value[idx] = val;
      } else if (key.type === 'string') {
        (obj.value as any)[key.value] = val;
      }
    }
  }

  private push(val: Value): void { this.stack.push(val); }
  private pop(): Value { return this.stack.pop() || this.nilVal(); }

  private getConst(index: number): Value {
    return this.chunk ? this.chunk.constants[index] || this.nilVal() : this.nilVal();
  }

  private getLocal(index: number): Value {
    return index < this.locals.length ? this.locals[index] : this.nilVal();
  }

  private setLocal(index: number, val: Value): void {
    while (this.locals.length <= index) this.locals.push(this.nilVal());
    this.locals[index] = val;
  }
}