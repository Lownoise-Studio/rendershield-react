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
 * Canonical string form of a watch/contract path.
 * `items[0].id` and `items.0.id` both become `items.0.id`.
 */
export function canonicalizePath(path: string): string {
  return normalizePath(path)
    .map((p) => String(p))
    .join(".");
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
 * - exact Array instances (`Array.prototype` only — not subclasses)
 * - plain objects (`Object.prototype` or `null` prototype)
 * - exact Date / RegExp / Map / Set instances (not subclasses)
 * - Date compared by time value; RegExp by source + flags
 * - Map / Set by size + SameValueZero membership (Map values deep-compared)
 *
 * Cycle-safe via left→right pair tracking. Not intended for huge graphs —
 * watch paths should stay small and intentional.
 *
 * Correctness principle: when semantic equality cannot be established safely,
 * return false (prefer unequal). Opaque class instances, built-in subclasses,
 * prototype mismatches, and other non-plain objects therefore never compare
 * equal merely because Object.keys() is empty.
 */
export function deepEqual(a: any, b: any, seen = new WeakMap<object, object>()): boolean {
  if (Object.is(a, b)) return true;

  const aObj = isObject(a);
  const bObj = isObject(b);
  if (!aObj || !bObj) return false;

  // Prototype / constructor mismatch → unequal (before cycle bookkeeping).
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  // Pair consistency: if `a` was already paired with a different `b`, unequal.
  // Do not overwrite the existing relation (avoids infinite recursion on
  // differently shaped cycles).
  const aSeen = seen.get(a);
  if (aSeen !== undefined) {
    return aSeen === b;
  }
  seen.set(a, b);

  if (Object.getPrototypeOf(a) === Array.prototype) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    if (arrA.length !== arrB.length) return false;
    for (let i = 0; i < arrA.length; i++) {
      if (!deepEqual(arrA[i], arrB[i], seen)) return false;
    }
    return true;
  }

  // Exact built-ins only — subclasses are opaque (prefer unequal).
  if (Object.getPrototypeOf(a) === Date.prototype) {
    const at = (a as Date).getTime();
    const bt = (b as Date).getTime();
    if (Number.isNaN(at) && Number.isNaN(bt)) return true;
    return at === bt;
  }

  if (Object.getPrototypeOf(a) === RegExp.prototype) {
    return (a as RegExp).source === (b as RegExp).source && (a as RegExp).flags === (b as RegExp).flags;
  }

  if (Object.getPrototypeOf(a) === Map.prototype) {
    const mapA = a as Map<unknown, unknown>;
    const mapB = b as Map<unknown, unknown>;
    if (mapA.size !== mapB.size) return false;
    for (const [key, value] of mapA) {
      if (!mapB.has(key)) return false;
      if (!deepEqual(value, mapB.get(key), seen)) return false;
    }
    return true;
  }

  if (Object.getPrototypeOf(a) === Set.prototype) {
    const setA = a as Set<unknown>;
    const setB = b as Set<unknown>;
    if (setA.size !== setB.size) return false;
    for (const value of setA) {
      // Set membership uses SameValueZero — prefer unequal over deep-matching
      // distinct object members inside the set.
      if (!setB.has(value)) return false;
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
