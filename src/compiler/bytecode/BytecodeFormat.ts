import { Instruction, BytecodeChunk, Value } from '../../vm/types';

export const BYTECODE_MAGIC = 0x4F4B5A42;
export const BYTECODE_VERSION = 1;

export interface BytecodeHeader {
  magic: number;
  version: number;
  instructionCount: number;
  constantCount: number;
  globalCount: number;
}

export function serializeBytecode(chunk: BytecodeChunk): ArrayBuffer {
  const instructions = chunk.instructions;
  const constants = chunk.constants;
  const globals = chunk.globals;

  const headerSize = 20;
  const instrSize = instructions.length * 9;
  const constSize = estimateConstantsSize(constants);
  const globalSize = globals.reduce((s, g) => s + 4 + g.length, 0);

  const buffer = new ArrayBuffer(headerSize + instrSize + constSize + globalSize);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, BYTECODE_MAGIC, true); offset += 4;
  view.setUint32(offset, BYTECODE_VERSION, true); offset += 4;
  view.setUint32(offset, instructions.length, true); offset += 4;
  view.setUint32(offset, constants.length, true); offset += 4;
  view.setUint32(offset, globals.length, true); offset += 4;

  for (const instr of instructions) {
    const opcodeNum = getOpcodeNumber(instr.opcode);
    view.setUint16(offset, opcodeNum, true); offset += 2;
    view.setUint8(offset, instr.operands.length); offset += 1;
    for (const op of instr.operands) {
      view.setUint32(offset, op, true); offset += 4;
    }
    const remainingOps = 2 - instr.operands.length;
    for (let i = 0; i < remainingOps; i++) {
      view.setUint32(offset, 0, true); offset += 4;
    }
  }

  return buffer;
}

export function deserializeBytecode(buffer: ArrayBuffer): BytecodeChunk {
  const view = new DataView(buffer);
  let offset = 0;

  const magic = view.getUint32(offset, true); offset += 4;
  const version = view.getUint32(offset, true); offset += 4;
  const instrCount = view.getUint32(offset, true); offset += 4;
  const constCount = view.getUint32(offset, true); offset += 4;
  const globalCount = view.getUint32(offset, true); offset += 4;

  if (magic !== BYTECODE_MAGIC) {
    throw new Error('Invalid bytecode format');
  }

  const instructions: Instruction[] = [];
  const constants: Value[] = [];
  const globals: string[] = [];

  for (let i = 0; i < instrCount; i++) {
    const opcodeNum = view.getUint16(offset, true); offset += 2;
    const argCount = view.getUint8(offset); offset += 1;
    const operands: number[] = [];
    for (let j = 0; j < argCount; j++) {
      operands.push(view.getUint32(offset, true)); offset += 4;
    }
    offset += (2 - argCount) * 4;
    instructions.push({ opcode: getOpcodeName(opcodeNum), operands });
  }

  return { instructions, constants, globals };
}

function getOpcodeNumber(name: string): number {
  const map: Record<string, number> = {
    'NOP': 0, 'PUSH': 1, 'POP': 2, 'ADD': 3, 'SUB': 4, 'MUL': 5,
    'DIV': 6, 'MOD': 7, 'NEG': 8, 'EQ': 9, 'NEQ': 10, 'LT': 11,
    'GT': 12, 'LTE': 13, 'GTE': 14, 'AND': 15, 'OR': 16, 'NOT': 17,
    'JMP': 18, 'JZ': 19, 'JNZ': 20, 'CALL': 21, 'RET': 22, 'LOAD': 23,
    'STORE': 24, 'LOAD_GLOBAL': 25, 'STORE_GLOBAL': 26, 'NEW_TABLE': 27,
    'NEW_ARRAY': 28, 'INDEX_GET': 29, 'INDEX_SET': 30, 'NATIVE_CALL': 31,
    'HALT': 32, 'NEW_STRING': 33, 'NEW_NUMBER': 34, 'NEW_BOOL': 35,
    'NEW_NIL': 36, 'DUP': 37, 'SWAP': 38, 'LOAD_CONST': 39, 'PRINT': 40,
    'MAKE_FUNCTION': 41, 'CLOSURE': 42, 'GET_UPVALUE': 43, 'SET_UPVALUE': 44,
    'CLOSE_UPVALUE': 45, 'CLASS': 46, 'NEW_OBJECT': 47, 'LOAD_FIELD': 48,
    'STORE_FIELD': 49, 'METHOD_CALL': 50, 'FOR_PREP': 51, 'FOR_LOOP': 52,
    'TFOR_LOOP': 53, 'SET_LIST': 54, 'CONCAT': 55, 'LEN': 56,
    'MULTI_RET': 57, 'FOR_IN': 58, 'FOR_IN_NEXT': 59, 'CALL_PROTECTED': 60,
    'VARARG': 61,
  };
  return map[name] || 0;
}

function getOpcodeName(num: number): string {
  const names: Record<number, string> = {
    0: 'NOP', 1: 'PUSH', 2: 'POP', 3: 'ADD', 4: 'SUB', 5: 'MUL',
    6: 'DIV', 7: 'MOD', 8: 'NEG', 9: 'EQ', 10: 'NEQ', 11: 'LT',
    12: 'GT', 13: 'LTE', 14: 'GTE', 15: 'AND', 16: 'OR', 17: 'NOT',
    18: 'JMP', 19: 'JZ', 20: 'JNZ', 21: 'CALL', 22: 'RET', 23: 'LOAD',
    24: 'STORE', 25: 'LOAD_GLOBAL', 26: 'STORE_GLOBAL', 27: 'NEW_TABLE',
    28: 'NEW_ARRAY', 29: 'INDEX_GET', 30: 'INDEX_SET', 31: 'NATIVE_CALL',
    32: 'HALT', 33: 'NEW_STRING', 34: 'NEW_NUMBER', 35: 'NEW_BOOL',
    36: 'NEW_NIL', 37: 'DUP', 38: 'SWAP', 39: 'LOAD_CONST', 40: 'PRINT',
    41: 'MAKE_FUNCTION', 42: 'CLOSURE', 43: 'GET_UPVALUE', 44: 'SET_UPVALUE',
    45: 'CLOSE_UPVALUE', 46: 'CLASS', 47: 'NEW_OBJECT', 48: 'LOAD_FIELD',
    49: 'STORE_FIELD', 50: 'METHOD_CALL', 51: 'FOR_PREP', 52: 'FOR_LOOP',
    53: 'TFOR_LOOP', 54: 'SET_LIST', 55: 'CONCAT', 56: 'LEN',
    57: 'MULTI_RET', 58: 'FOR_IN', 59: 'FOR_IN_NEXT', 60: 'CALL_PROTECTED',
    61: 'VARARG',
  };
  return names[num] || 'NOP';
}

function estimateConstantsSize(constants: Value[]): number {
  let size = 4;
  for (const c of constants) {
    size += 1;
    switch (c.type) {
      case 'number': size += 8; break;
      case 'string': size += 4 + c.value.length; break;
      case 'boolean': size += 1; break;
      default: break;
    }
  }
  return size;
}