import { Value } from '../types';

export class StackFrame {
  public pc: number;
  public sp: number;
  public locals: Value[];
  public name: string;
  public returnAddress: number;

  constructor(pc: number, sp: number, locals: Value[], name: string, returnAddress: number) {
    this.pc = pc;
    this.sp = sp;
    this.locals = locals;
    this.name = name;
    this.returnAddress = returnAddress;
  }
}