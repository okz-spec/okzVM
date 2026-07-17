export interface VMConfig {
  cpuFrequency: number;
  cpuCores: number;
  ramSize: number;
  videoWidth: number;
  videoHeight: number;
  fpsLimit: number;
}

export enum VMState {
  Boot = 'boot',
  Running = 'running',
  Paused = 'paused',
  Shutdown = 'shutdown',
}

export type ProcessState = 'idle' | 'running' | 'suspended' | 'terminated' | 'error';

export type StepResult = 'continue' | 'yield' | 'halt';

export interface VMRuntime {
  pc: number;
  sp: number;
  stack: number[];
  locals: Value[];
  globals: Record<string, Value>;
  frames: CallFrame[];
  state: 'idle' | 'running' | 'paused' | 'halted' | 'error';
}

export interface CallFrame {
  pc: number;
  sp: number;
  locals: Value[];
  name: string;
  nvals: number;
}

export type Value =
  | { type: 'nil' }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'table'; value: Record<string | number, Value> }
  | { type: 'array'; value: Value[] }
  | { type: 'function'; value: FunctionValue }
  | { type: 'native'; value: NativeFunction }
  | { type: 'object'; value: Record<string, Value> };

export interface FunctionValue {
  name: string;
  address: number;
  arity: number;
  locals: number;
}

export type NativeFunction = (ctx: any, ...args: Value[]) => Value;

export interface ExecutionContext {
  getNativeFunction(index: number): ((ctx: any) => Value) | undefined;
  log(msg: string, type?: string): void;
  getGlobal(name: string): Value;
  setGlobal(name: string, val: Value): void;
}

export interface Instruction {
  opcode: string;
  operands: number[];
}

export type InstructionNum = {
  opcode: number;
  operands: number[];
};

export interface BytecodeChunk {
  instructions: Instruction[];
  constants: Value[];
  globals: string[];
}

export interface MemoryBlock {
  address: number;
  size: number;
  data: ArrayBuffer;
  free: boolean;
}

export interface ProcessInfo {
  id: number;
  name: string;
  state: string;
  memoryUsage: number;
  memoryBudget: number;
  pc: number;
  instructionsExecuted: number;
}

export interface FileDescriptor {
  id: number;
  path: string;
  mode: 'read' | 'write' | 'append';
  position: number;
}

export interface VMDisk {
  name: string;
  size: number;
  blocks: DiskBlock[];
}

export interface DiskBlock {
  id: number;
  offset: number;
  size: number;
  used: boolean;
  data: Buffer;
}