import { describe, it, expect } from 'vitest';
import { getAtPath, compareWatchedPaths, deepEqual, canonicalizePath } from './pathCompare';

describe('Path Comparison Engine', () => {
  const data = {
    user: { id: 1, profile: { name: 'Gemini' } },
    items: [{ id: 'a', val: 10 }, { id: 'b', val: 20 }]
  };

  it('should extract nested values correctly (getAtPath)', () => {
    expect(getAtPath(data, 'user.profile.name')).toBe('Gemini');
    expect(getAtPath(data, 'items[1].val')).toBe(20);
  });

  it('canonicalizes equivalent path syntaxes', () => {
    expect(canonicalizePath('items[0].id')).toBe('items.0.id');
    expect(canonicalizePath('items.0.id')).toBe('items.0.id');
    expect(canonicalizePath('user.profile.name')).toBe('user.profile.name');
  });

  it('should detect stability in watched paths', () => {
    const nextData = { ...data, user: { ...data.user, profile: { name: 'Gemini' } } };
    const result = compareWatchedPaths(data, nextData, ['user.profile.name']);
    
    expect(result.watchedEqual).toBe(true);
    expect(result.watchedStable).toContain('user.profile.name');
  });

  it('should detect changes in watched paths', () => {
    const nextData = { ...data, user: { ...data.user, id: 2 } };
    const result = compareWatchedPaths(data, nextData, ['user.id']);
    
    expect(result.watchedEqual).toBe(false);
    expect(result.watchedChanged).toContain('user.id');
  });
});

describe('deepEqual supported domain', () => {
  it('preserves primitive, array, and plain object equality', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual([1, { a: 2 }], [1, { a: 2 }])).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual(Object.create(null), Object.create(null))).toBe(true);
  });

  it('compares Date by time value, not empty keys', () => {
    expect(deepEqual(new Date(1), new Date(1))).toBe(true);
    expect(deepEqual(new Date(1), new Date(2))).toBe(false);
    expect(deepEqual(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
  });

  it('compares RegExp by source and flags', () => {
    expect(deepEqual(/ab/gi, /ab/gi)).toBe(true);
    expect(deepEqual(/ab/g, /ab/i)).toBe(false);
    expect(deepEqual(/ab/, /ac/)).toBe(false);
  });

  it('compares Map and Set conservatively (membership / entries)', () => {
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 1]]))).toBe(true);
    expect(deepEqual(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
    expect(deepEqual(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
    expect(deepEqual(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    expect(deepEqual(new Set([1]), new Set([2]))).toBe(false);
    // Distinct object members: SameValueZero membership → prefer unequal
    expect(deepEqual(new Set([{ x: 1 }]), new Set([{ x: 1 }]))).toBe(false);
  });

  it('treats built-in subclasses as opaque (prefer unequal)', () => {
    class SecretMap extends Map<string, number> {
      #secret: string;
      constructor(entries?: Iterable<readonly [string, number]>, secret = 'x') {
        super(entries);
        this.#secret = secret;
      }
    }
    class SecretSet extends Set<number> {
      #secret: string;
      constructor(values?: Iterable<number>, secret = 'x') {
        super(values);
        this.#secret = secret;
      }
    }
    class SecretDate extends Date {}
    class SecretRegExp extends RegExp {}

    expect(
      deepEqual(new SecretMap([['a', 1]]), new SecretMap([['a', 1]]))
    ).toBe(false);
    expect(deepEqual(new SecretSet([1]), new SecretSet([1]))).toBe(false);
    expect(deepEqual(new SecretDate(1), new SecretDate(1))).toBe(false);
    expect(deepEqual(new SecretRegExp('ab', 'g'), new SecretRegExp('ab', 'g'))).toBe(
      false
    );

    // Same reference still equal via Object.is
    const shared = new SecretMap([['a', 1]]);
    expect(deepEqual(shared, shared)).toBe(true);
  });

  it('does not treat opaque class instances as equal via empty keys', () => {
    class Opaque {
      #value: number;
      constructor(value: number) {
        this.#value = value;
      }
    }

    expect(deepEqual(new Opaque(1), new Opaque(2))).toBe(false);
    expect(deepEqual(new Opaque(1), new Opaque(1))).toBe(false);
    expect(deepEqual(new Opaque(1), {})).toBe(false);
  });

  it('rejects prototype / type mismatches', () => {
    expect(deepEqual([], {})).toBe(false);
    expect(deepEqual(new Date(1), {})).toBe(false);
    expect(deepEqual(new Map(), {})).toBe(false);
    expect(deepEqual(/a/, {})).toBe(false);
  });

  it('terminates on equivalent self-cyclic Maps', () => {
    const a = new Map<string, unknown>();
    a.set('self', a);
    const b = new Map<string, unknown>();
    b.set('self', b);

    expect(() => deepEqual(a, b)).not.toThrow();
    expect(deepEqual(a, b)).toBe(true);
  });

  it('terminates and returns unequal for differently shaped cyclic Maps', () => {
    const a = new Map<string, unknown>();
    a.set('self', a);

    const b1 = new Map<string, unknown>();
    const b2 = new Map<string, unknown>();
    b1.set('self', b2);
    b2.set('self', b1);

    expect(() => deepEqual(a, b1)).not.toThrow();
    expect(deepEqual(a, b1)).toBe(false);
  });

  it('preserves cycle-safe equality for plain objects', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    const b: Record<string, unknown> = {};
    b.self = b;
    expect(deepEqual(a, b)).toBe(true);

    const c: Record<string, unknown> = {};
    const d: Record<string, unknown> = {};
    c.self = d;
    d.self = c;
    expect(() => deepEqual(a, c)).not.toThrow();
    expect(deepEqual(a, c)).toBe(false);
  });
});

describe('watched paths must not falsely shield special values', () => {
  it('detects Date changes at a watched path', () => {
    const prev = { ts: new Date(1) };
    const next = { ts: new Date(999) };
    const result = compareWatchedPaths(prev, next, ['ts']);
    expect(result.watchedEqual).toBe(false);
    expect(result.watchedChanged).toEqual(['ts']);
  });

  it('detects RegExp, Map, Set, and opaque changes at watched paths', () => {
    class Tag {
      constructor(public id: number) {}
    }

    expect(
      compareWatchedPaths({ r: /a/ }, { r: /b/ }, ['r']).watchedEqual
    ).toBe(false);

    expect(
      compareWatchedPaths(
        { m: new Map([['k', 1]]) },
        { m: new Map([['k', 2]]) },
        ['m']
      ).watchedEqual
    ).toBe(false);

    expect(
      compareWatchedPaths({ s: new Set([1]) }, { s: new Set([2]) }, ['s'])
        .watchedEqual
    ).toBe(false);

    expect(
      compareWatchedPaths({ t: new Tag(1) }, { t: new Tag(2) }, ['t'])
        .watchedEqual
    ).toBe(false);
  });
});
