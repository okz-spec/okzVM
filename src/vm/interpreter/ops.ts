import { Value } from '../types';

export const _nil: Value = { type: 'nil' };

// Opcode map. 57 opcodes, densely packed, no gaps. If you need to add one,
// good luck finding the right spot without a ruler. The numeric values are
// referenced by raw case numbers in Process.ts, so don't reorder anything.
// Yes, this is fragile. No, I don't have a better idea.
export const _opcodeMap: Record<string, number> = {
  'NOP':0,'PUSH':1,'POP':2,'ADD':3,'SUB':4,'MUL':5,'DIV':6,'MOD':7,
  'NEG':8,'EQ':9,'NEQ':10,'LT':11,'GT':12,'LTE':13,'GTE':14,
  'AND':15,'OR':16,'NOT':17,'JMP':18,'JZ':19,'JNZ':20,'CALL':21,
  'RET':22,'LOAD':23,'STORE':24,'LOAD_GLOBAL':25,'STORE_GLOBAL':26,
  'NEW_TABLE':27,'NEW_ARRAY':28,'INDEX_GET':29,'INDEX_SET':30,
  'NATIVE_CALL':31,'HALT':32,'NEW_STRING':33,'NEW_NUMBER':34,
  'NEW_BOOL':35,'NEW_NIL':36,'DUP':37,'SWAP':38,'LOAD_CONST':39,
  'PRINT':40,'MAKE_FUNCTION':41,'CLOSURE':42,'GET_UPVALUE':43,
  'SET_UPVALUE':44,'CLOSE_UPVALUE':45,'CLASS':46,'NEW_OBJECT':47,
  'LOAD_FIELD':48,'STORE_FIELD':49,'METHOD_CALL':50,'FOR_PREP':51,
  'FOR_LOOP':52,'TFOR_LOOP':53,'SET_LIST':54,'CONCAT':55,'LEN':56,
  'MULTI_RET':57,'FOR_IN':58,'FOR_IN_NEXT':59,'CALL_PROTECTED':60,'VARARG':61,
};

export function numVal(v: Value): number {
  return v.type === 'number' ? v.value : 0;
}

export function truthy(v: Value): boolean {
  if (v.type === 'nil') return false;
  if (v.type === 'boolean') return v.value;
  if (v.type === 'number') return v.value !== 0;
  return true;
}

// Equality check. For tables and arrays, this is reference equality (===),
// not deep equality. Two tables with identical contents will not be equal.
// This is technically wrong for Lua semantics but deep-equality is expensive
// and nobody's complained yet. If they do, that's a future-me problem.
export function valuesEqual(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'nil': return true;
    case 'number': return a.value === (b as any).value;
    case 'boolean': return a.value === (b as any).value;
    case 'string': return a.value === (b as any).value;
    case 'array': return a === b;
    case 'table': return a === b;
    default: return a === b;
  }
}

export function valueToString(v: Value): string {
  if (!v) return 'nil';
  switch (v.type) {
    case 'nil': return 'nil';
    case 'number': return String(v.value);
    case 'boolean': return v.value ? 'true' : 'false';
    case 'string': return v.value;
    case 'table': return '{...}';
    case 'array': return '[...]';
    case 'function': return `function ${v.value.name}`;
    case 'native': return '<native function>';
    default: return '?';
  }
}