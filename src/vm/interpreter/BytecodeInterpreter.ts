import { Process } from '../process/Process';
import { Value, BytecodeChunk, StepResult } from '../types';
import { valueToString as _valueToString } from './ops';

export class BytecodeInterpreter {
  public process: Process | null = null;
  public syncRequested: boolean = false;

  public load(chunk: BytecodeChunk, process?: Process): void {
    if (process) {
      this.process = process;
      this.process.chunk = chunk;
      this.process.pc = 0;
      this.process.stack = [];
      this.process.locals = [];
      this.process.frames = [];
      this.process.halted = false;
    }
  }

  public step(): boolean {
    if (!this.process || this.process.halted) return false;
    const result = this.process.step();
    if (result === 'halt' || this.process.halted) return false;
    return true;
  }

  public get stack(): Value[] { return this.process?.stack || []; }
  public get locals(): Value[] { return this.process?.locals || []; }
  public get globals(): Record<string, Value> { return this.process?.globals || {}; }
  public set globals(g: Record<string, Value>) { if (this.process) this.process.globals = g; }
  public get pc(): number { return this.process?.pc || 0; }
  public get halted(): boolean { return this.process?.halted || false; }

  public valueToString(v: Value): string {
    return _valueToString(v);
  }

  public reset(): void {
    this.process = null;
    this.syncRequested = false;
  }
}