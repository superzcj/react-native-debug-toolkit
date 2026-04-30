import { safeStringify } from '../../utils/safeStringify';

describe('safeStringify', () => {
  it('stringifies plain objects', () => {
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
  });

  it('stringifies with indentation', () => {
    const result = safeStringify({ a: 1 }, 2);
    expect(result).toContain('\n');
  });

  it('handles circular references', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;
    const result = safeStringify(obj);
    expect(result).toContain('[Circular]');
    expect(result).toContain('test');
  });

  it('handles null', () => {
    expect(safeStringify(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(safeStringify(undefined)).toBe(undefined);
  });

  it('handles primitive values', () => {
    expect(safeStringify(42)).toBe('42');
    expect(safeStringify('hello')).toBe('"hello"');
    expect(safeStringify(true)).toBe('true');
  });

  it('handles arrays', () => {
    expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
  });

  it('handles nested circular references', () => {
    const a: Record<string, unknown> = { name: 'a' };
    const b: Record<string, unknown> = { name: 'b', ref: a };
    a.ref = b;
    const result = safeStringify(a);
    expect(result).toContain('[Circular]');
  });
});
