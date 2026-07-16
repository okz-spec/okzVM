export const VERSION = '0.1.0';
export const OKZ_EXTENSION = '.okz';
export const OKZB_EXTENSION = '.okzb';
export const MANIFEST_FILE = 'manifest.json';

export const OPCODE_CYCLES: Record<string, number> = {
  NOP: 1,
  PUSH: 1,
  POP: 1,
  ADD: 1,
  SUB: 1,
  MUL: 2,
  DIV: 8,
  MOD: 6,
  EQ: 1,
  NEQ: 1,
  LT: 1,
  GT: 1,
  LTE: 1,
  GTE: 1,
  AND: 1,
  OR: 1,
  NOT: 1,
  JMP: 1,
  JZ: 1,
  JNZ: 1,
  CALL: 5,
  RET: 2,
  LOAD: 1,
  STORE: 1,
  LOAD_GLOBAL: 2,
  STORE_GLOBAL: 2,
  NEW_TABLE: 3,
  NEW_ARRAY: 3,
  INDEX_GET: 2,
  INDEX_SET: 2,
  NATIVE_CALL: 5,
  HALT: 1,
  DRAW_PIXEL: 20,
  DRAW_LINE: 30,
  DRAW_RECT: 25,
  DRAW_CIRCLE: 40,
  DRAW_TEXT: 100,
};

export const PAGE_SIZE = 4096;
export const MAX_ALLOWED_MEMORY = 1024 * 1024 * 1024;