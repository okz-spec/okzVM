import { Value, BytecodeChunk, CallFrame, ProcessState, StepResult } from '../types';
import { _opcodeMap, numVal, truthy, valuesEqual, valueToString } from '../interpreter/ops';

const _nil: Value = { type: 'nil' };

export class Process {
  public id: number;
  public name: string;
  public state: ProcessState = 'idle';
  public context: any = null;
  public logFn: ((msg: string, type?: string) => void) | null = null;

  public pc: number = 0;
  public stack: Value[] = [];
  public locals: Value[] = [];
  public frames: CallFrame[] = [];
  public globals: Record<string, Value> = {};
  public chunk: BytecodeChunk | null = null;
  public halted: boolean = false;

  public memoryBudget: number = 64 * 1024;
  public memoryUsed: number = 0;
  public instructionsExecuted: number = 0;
  public totalInstructions: number = 0;

  public files: Map<number, string> = new Map();
  public windows: number[] = [];
  public created: number = Date.now();
  public cpuTime: number = 0;
  public sleepUntil: number = 0;

  constructor(id: number, name: string, chunk: BytecodeChunk) {
    this.id = id;
    this.name = name;
    this.chunk = chunk;
    this.state = 'running';
  }

  public step(): StepResult {
    if (this.halted || !this.chunk) return 'halt';
    const instrs = this.chunk.instructions;
    if (this.pc >= instrs.length) {
      this.halted = true;
      return 'halt';
    }

    const instr = instrs[this.pc];
    const opcode = _opcodeMap[instr.opcode] | 0;
    const ops = instr.operands;
    const line = (instr as any).line ?? 0;

    this.instructionsExecuted++;
    this.totalInstructions++;
    this.pc++;

    try {

    switch (opcode) {
      case 0: break;
      case 1: this.push(this.getConst(ops[0])); break;
      case 2: if (ops.length > 0) { this.setLocal(ops[0], this.pop()); } else { this.pop(); } break;
      case 3: { const b = this.pop(); const a = this.pop(); this.push({ type: 'number', value: numVal(a) + numVal(b) }); break; }
      case 4: { const b = this.pop(); const a = this.pop(); this.push({ type: 'number', value: numVal(a) - numVal(b) }); break; }
      case 5: { const b = this.pop(); const a = this.pop(); this.push({ type: 'number', value: numVal(a) * numVal(b) }); break; }
      case 6: { const b = this.pop(); const a = this.pop(); this.push({ type: 'number', value: numVal(a) / numVal(b) }); break; }
      case 7: { const b = this.pop(); const a = this.pop(); this.push({ type: 'number', value: numVal(a) % numVal(b) }); break; }
      case 8: this.push({ type: 'number', value: -numVal(this.pop()) }); break;
      case 9: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: valuesEqual(a, b) }); break; }
      case 10: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: !valuesEqual(a, b) }); break; }
      case 11: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: numVal(a) < numVal(b) }); break; }
      case 12: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: numVal(a) > numVal(b) }); break; }
      case 13: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: numVal(a) <= numVal(b) }); break; }
      case 14: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: numVal(a) >= numVal(b) }); break; }
      case 15: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: truthy(a) && truthy(b) }); break; }
      case 16: { const b = this.pop(); const a = this.pop(); this.push({ type: 'boolean', value: truthy(a) || truthy(b) }); break; }
      case 17: this.push({ type: 'boolean', value: !truthy(this.pop()) }); break;
      case 18: this.pc = ops[0]; break;
      case 19: { const cond = this.pop(); if (!truthy(cond)) this.pc = ops[0]; break; }
      case 20: { const cond = this.pop(); if (truthy(cond)) this.pc = ops[0]; break; }
      case 21: {
        const argCount = ops[0];
        const nvals = ops[1] || 1;
        const stack = this.stack;
        const fnIdx = stack.length - 1 - argCount;
        if (fnIdx < 0) { this.push(_nil); break; }
        const fnVal = stack[fnIdx];
        if (fnVal.type === 'native') {
          const lenBefore = stack.length;
          stack.splice(stack.length - 1 - argCount, 1);
          const result = fnVal.value(this.context || this);
          stack.push(result);
          while (stack.length > lenBefore - argCount) {
            const idx = stack.length - 2;
            if (idx >= 0) stack.splice(idx, 1);
            else break;
          }
        } else if (fnVal.type === 'number') {
          const addr = fnVal.value;
          const removed = stack.splice(stack.length - 1 - argCount, argCount + 1);
          this.frames.push({ pc: this.pc, sp: stack.length - 1, locals: this.locals, name: 'func', nvals: 1 });
          this.pc = addr;
          this.locals = removed.slice(1);
        } else if (fnVal.type === 'function') {
          const func = fnVal.value;
          const removed = stack.splice(stack.length - 1 - argCount, argCount + 1);
          this.frames.push({ pc: this.pc, sp: stack.length - 1, locals: this.locals, name: func.name, nvals });
          this.pc = func.address;
          const args = removed.slice(1);
          if (func.locals > argCount) {
            for (let i = argCount; i < func.locals; i++) args.push(_nil);
          }
          this.locals = args;
        } else {
          stack.splice(stack.length - 1 - argCount, argCount + 1);
          stack.push(_nil);
        }
        break;
      }
      case 22: {
        const returnCount = ops[0] || 1;
        const returnVals: Value[] = [];
        for (let i = 0; i < returnCount; i++) {
          returnVals.unshift(this.pop());
        }
        const frame = this.frames.pop();
        if (!frame) { this.halted = true; return 'halt'; }
        this.pc = frame.pc;
        this.locals = frame.locals;
        this.stack.length = frame.sp + 1;
        for (const rv of returnVals) this.push(rv);
        break;
      }
      case 23: this.push(this.getLocal(ops[0])); break;
      case 24: this.setLocal(ops[0], this.pop()); break;
      case 25: this.push(this.globals[this.chunk.globals[ops[0]]] || _nil); break;
      case 26: this.globals[this.chunk.globals[ops[0]]] = this.pop(); break;
      case 27: this.push({ type: 'table', value: {} }); break;
      case 28: this.push({ type: 'array', value: [] }); break;
      case 29: {
        const key = this.pop();
        const obj = this.pop();
        if (obj.type === 'table') {
          const k = key.type === 'number' ? String(key.value) : (key.type === 'string' ? key.value : '');
          this.push(obj.value[k] || _nil);
        } else if (obj.type === 'array') {
          if (key.type === 'number') this.push(obj.value[key.value] || _nil);
          else if (key.type === 'string') this.push((obj.value as any)[key.value] || _nil);
          else this.push(_nil);
        } else if (obj.type === 'string') {
          const str = obj.value;
          if (key.type === 'number') {
            const idx = Math.floor(key.value);
            if (idx >= 1 && idx <= str.length) {
              this.push({ type: 'string', value: str[idx - 1] });
            } else { this.push(_nil); }
          } else { this.push(_nil); }
        } else { this.push(_nil); }
        break;
      }
      case 30: {
        const val = this.pop();
        const key = this.pop();
        const obj = this.pop();
        if (obj.type === 'table') {
          const k = key.type === 'number' ? String(key.value) : (key.type === 'string' ? key.value : '');
          obj.value[k] = val;
        } else if (obj.type === 'array') {
          if (key.type === 'number') {
            const idx = key.value;
            if (idx >= obj.value.length) obj.value.length = idx + 1;
            obj.value[idx] = val;
          } else if (key.type === 'string') { (obj.value as any)[key.value] = val; }
        }
        this.push(val);
        break;
      }
      case 33: this.push({ type: 'string', value: this.chunk.constants[ops[0]] as any as string || '' }); break;
      case 34: this.push({ type: 'number', value: (this.chunk.constants[ops[0]] as any as number) || 0 }); break;
      case 35: this.push({ type: 'boolean', value: ops[0] !== 0 }); break;
      case 36: this.push(_nil); break;
      case 37: { const v = this.pop(); this.push(v); this.push(v); break; }
      case 38: { const a = this.pop(); const b = this.pop(); this.push(a); this.push(b); break; }
      case 39: this.push(this.getConst(ops[0])); break;
      case 40: { const val = this.pop(); this.vmLog(valueToString(val)); break; }
      case 41: { // MAKE_FUNCTION
        const addr = this.chunk.constants[ops[0]] as any;
        const fname = this.chunk.constants[ops[1]] as any;
        const funcAddr = addr?.value ?? 0;
        const funcName = fname?.value ?? '';
        const funcLocals = ops[2] || 0;
        this.push({ type: 'function', value: { address: funcAddr, locals: funcLocals, name: funcName } });
        break;
      }
      case 42: case 43: case 44: case 45: case 46: case 47: case 48:
      case 49: case 50: this.push(_nil); break;
      case 51: case 52: case 53: case 54: break;
      case 55: { const b = this.pop(); const a = this.pop(); const sa = a.type === 'string' ? a.value : valueToString(a); const sb = b.type === 'string' ? b.value : valueToString(b); this.push({ type: 'string', value: sa + sb }); break; }
      case 56: { const v = this.pop(); if (v.type === 'string') this.push({ type: 'number', value: v.value.length }); else if (v.type === 'array') this.push({ type: 'number', value: Object.keys(v.value).length }); else if (v.type === 'table') this.push({ type: 'number', value: Object.keys(v.value).length }); else this.push({ type: 'number', value: 0 }); break; }
      case 57: { // MULTI_RET: trim excess return values
        const desired = ops[0] || 1;
        const nvals = ops[1] || 1;
        const excess = nvals - desired;
        if (excess > 0) {
          this.stack.splice(this.stack.length - excess, excess);
        }
        break;
      }
      case 58: { // FOR_IN: initialize generic for loop
        const iteratorFn = this.pop();
        const state = this.pop();
        const initial = this.pop();
        this.push(initial);
        this.push(state);
        this.push(iteratorFn);
        break;
      }
      case 59: { // FOR_IN_NEXT: call iterator and check for nil
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
            const result = iteratorFn.value(this.context || this);
            if (result.type === 'nil') {
              this.stack.splice(this.stack.length - 5, 5);
              this.pc = exitAddr;
            } else {
              this.stack.splice(this.stack.length - 5, 5);
              this.push(result);
              for (let i = 1; i < varCount; i++) this.push(_nil);
            }
          } else {
            const removed = this.stack.splice(this.stack.length - 3, 3);
            this.frames.push({ pc: this.pc, sp: this.stack.length - 1, locals: this.locals, name: 'for_in_next', nvals: varCount });
            this.pc = iteratorFn.value.address;
            this.locals = removed;
          }
        } else {
          this.stack.splice(this.stack.length - 3, 3);
          this.pc = exitAddr;
        }
        break;
      }
      case 60: { // CALL_PROTECTED: call with error protection
        const argCount = ops[0];
        const handlerAddr = ops[1];
        const stack = this.stack;
        const fnIdx = stack.length - 1 - argCount;
        if (fnIdx < 0) { this.push(_nil); break; }
        const fnVal = stack[fnIdx];
        if (fnVal.type === 'native') {
          try {
            const lenBefore = stack.length;
            stack.splice(stack.length - 1 - argCount, 1);
            const result = fnVal.value(this.context || this);
            stack.push(result);
            while (stack.length > lenBefore - argCount) {
              const idx = stack.length - 2;
              if (idx >= 0) stack.splice(idx, 1);
              else break;
            }
          } catch (e: any) {
            stack.splice(stack.length - argCount, argCount);
            stack.push({ type: 'boolean', value: false });
            stack.push({ type: 'string', value: e?.message || 'unknown error' });
          }
        } else if (fnVal.type === 'function') {
          const func = fnVal.value;
          const removed = stack.splice(stack.length - 1 - argCount, argCount + 1);
          this.frames.push({ pc: this.pc, sp: stack.length - 1, locals: this.locals, name: func.name, nvals: 1 });
          this.pc = func.address;
          const args = removed.slice(1);
          if (func.locals > argCount) {
            for (let i = argCount; i < func.locals; i++) args.push(_nil);
          }
          this.locals = args;
        } else {
          stack.splice(stack.length - 1 - argCount, argCount + 1);
          stack.push({ type: 'boolean', value: true });
          stack.push(_nil);
        }
        break;
      }
      case 32: return 'halt';
      default: return 'halt';
    }
    } catch (e: any) {
      const msg = e?.message || 'unknown error';
      this.logFn?.(`Runtime error at line ${line}: ${msg}`, 'error');
      this.halted = true;
      return 'halt';
    }

    return 'continue';
  }

  public push(val: Value): void { this.stack.push(val); }
  public pop(): Value { return this.stack.pop() || _nil; }

  public getLocal(index: number): Value {
    return index < this.locals.length ? this.locals[index] : _nil;
  }

  public setLocal(index: number, val: Value): void {
    while (this.locals.length <= index) this.locals.push(_nil);
    this.locals[index] = val;
  }

  public getConst(index: number): Value {
    return this.chunk?.constants[index] || _nil;
  }

  private vmLog(msg: string): void {
    if (this.logFn) {
      this.logFn(msg, 'info');
    }
  }

  public terminate(): void {
    this.state = 'terminated';
    this.stack = [];
    this.locals = [];
    this.frames = [];
    this.halted = true;
    this.files.clear();
  }
}