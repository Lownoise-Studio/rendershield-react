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
   * - Cycle-safe
   * - Handles primitives, arrays, plain objects
   * - Not intended for huge graphs (watch paths should stay small + intentional)
   */
  export function deepEqual(a: any, b: any, seen = new WeakMap<object, object>()): boolean {
    if (Object.is(a, b)) return true;
  
    const aObj = isObject(a);
    const bObj = isObject(b);
    if (!aObj || !bObj) return false;
  
    // Cycle handling
    const aSeen = seen.get(a);
    if (aSeen && aSeen === b) return true;
    seen.set(a, b);
  
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b)) return false;
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i], seen)) return false;
      }
      return true;
    }
  
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
  
    // Ensure same keys
    for (const k of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    }
  
    for (const k of aKeys) {
      if (!deepEqual((a as Record<string, any>)[k], (b as Record<string, any>)[k], seen)) return false;
    }
  
    return true;
  }
  
  function isObject(v: any): v is object {
    return v !== null && typeof v === "object";
  }
  
  function normalizePath(path: string): Array<string | number> {
    // Supports: "user.id", "items[0].name", "items.0.name"
    const out: Array<string | number> = [];
    const cleaned = path.replace(/\[(\d+)\]/g, ".$1");
    for (const part of cleaned.split(".").filter(Boolean)) {
      const n = Number(part);
      out.push(Number.isInteger(n) && String(n) === part ? n : part);
    }
    return out;
  }
  