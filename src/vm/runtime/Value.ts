import { Value } from '../types';

export function isTruthy(v: Value): boolean {
  switch (v.type) {
    case 'nil': return false;
    case 'boolean': return v.value;
    case 'number': return v.value !== 0;
    default: return true;
  }
}

export function valuesEqual(a: Value, b: Value): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'nil': return true;
    case 'number': return a.value === (b as any).value;
    case 'boolean': return a.value === (b as any).value;
    case 'string': return a.value === (b as any).value;
    default: return a === b;
  }
}

export function valueToString(v: Value): string {
  switch (v.type) {
    case 'nil': return 'nil';
    case 'number': return String(v.value);
    case 'boolean': return v.value ? 'true' : 'false';
    case 'string': return v.value;
    case 'table': return '{ ... }';
    case 'array': return '[ ... ]';
    case 'function': return `function ${v.value.name}`;
    case 'native': return '<native>';
    default: return '?';
  }
}

export function nilVal(): Value { return { type: 'nil' }; }
export function numVal(n: number): Value { return { type: 'number', value: n }; }
export function boolVal(b: boolean): Value { return { type: 'boolean', value: b }; }
export function strVal(s: string): Value { return { type: 'string', value: s }; }
export function tableVal(t: Record<string | number, Value> = {}): Value { return { type: 'table', value: t }; }
export function arrayVal(a: Value[] = []): Value { return { type: 'array', value: a }; }