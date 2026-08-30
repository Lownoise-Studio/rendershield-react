export function getAtPath(obj: any, path: string): any {
  if (obj == null) return undefined;
  const parts = normalizePath(path);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p as any];
  }
  return cur;
}

/**
 * Deep compare ONLY the values at watched paths.
 * This is intentionally targeted: no full-object deep recursion.
 */
export function compareWatchedPaths<T>(
  prev: T,
  next: T,
  watch: string[]
): {
  watchedChanged: string[];
  watchedStable: string[];
  watchedEqual: boolean;
} {
  const watchedChanged: string[] = [];
  const watchedStable: string[] = [];

  for (const p of watch) {
    const a = getAtPath(prev as any, p);
    const b = getAtPath(next as any, p);

    if (deepEqual(a, b)) watchedStable.push(p);
    else watchedChanged.push(p);
  }

  return {
    watchedChanged,
    watchedStable,
    watchedEqual: watchedChanged.length === 0,
  };
}

/**
 * Minimal deep equality for watched values.
 *
 * Supported domain (intentionally narrow):
 * - primitives (via Object.is, including NaN)
 * - arrays
 * - plain objects (`Object.prototype` or `null` prototype)
 * - Date (compared by time value)
 * - RegExp (compared by source + flags)
 * - Map / Set (size + SameValueZero membership; values deep-compared for Map)
 *
 * Cycle-safe via WeakMap. Not intended for huge graphs — watch paths should
 * stay small and intentional.
 *
 * Correctness principle: when semantic equality cannot be established safely,
 * return false (prefer unequal). Opaque class instances, prototype mismatches,
 * and other non-plain objects therefore never compare equal merely because
 * Object.keys() is empty.
 */
export function deepEqual(a: any, b: any, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(a, b)) return true;

  const aObj = isObject(a);
  const bObj = isObject(b);
  if (!aObj || !bObj) return false;

  // Prototype / constructor mismatch → unequal (before cycle bookkeeping).
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  const aSeen = seen.get(a);
  if (aSeen && aSeen === b) return true;
  seen.set(a, b);

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], seen)) return false;
    }
    return true;
  }

  if (a instanceof Date) {
    if (!(b instanceof Date)) return false;
    const at = a.getTime();
    const bt = b.getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return true;
    return at === bt;
  }

  if (a instanceof RegExp) {
    if (!(b instanceof RegExp)) return false;
    return a.source === b.source && a.flags === b.flags;
  }

  if (a instanceof Map) {
    if (!(b instanceof Map)) return false;
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key)) return false;
      if (!deepEqual(value, b.get(key), seen)) return false;
    }
    return true;
  }

  if (a instanceof Set) {
    if (!(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    for (const value of a) {
      // Set membership uses SameValueZero — prefer unequal over deep-matching
      // distinct object members inside the set.
      if (!b.has(value)) return false;
    }
    return true;
  }

  // Opaque / non-plain instances: do not treat empty Object.keys() as equality.
  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
  }

  for (const k of aKeys) {
    if (!deepEqual((a as Record<string, any>)[k], (b as Record<string, any>)[k], seen)) {
      return false;
    }
  }

  return true;
}

function isObject(v: any): v is object {
  return v !== null && typeof v === "object";
}

function isPlainObject(v: object): boolean {
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function normalizePath(path: string): Array<string | number> {
  const out: Array<string | number> = [];
  const cleaned = path.replace(/\[(\d+)\]/g, ".$1");
  for (const part of cleaned.split(".").filter(Boolean)) {
    const n = Number(part);
    out.push(Number.isInteger(n) && String(n) === part ? n : part);
  }
  return out;
}
