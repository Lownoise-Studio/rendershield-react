export function getShallowDiff(prev: any, next: any): {
    equal: boolean;
    changedKeys: string[];
    stableKeys: string[];
  } {
    if (Object.is(prev, next)) {
      // Same reference or both NaN, etc.
      return { equal: true, changedKeys: [], stableKeys: keysOf(next) };
    }
  
    // Non-objects: strict identity check is enough
    if (!isObject(prev) || !isObject(next)) {
      return { equal: false, changedKeys: ["(value)"], stableKeys: [] };
    }
  
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
  
    // Build key universe (shallow compare is O(n) over top-level keys)
    const keySet = new Set<string>([...prevKeys, ...nextKeys]);
  
    const changedKeys: string[] = [];
    const stableKeys: string[] = [];
  
    for (const k of keySet) {
      const a = (prev as any)[k];
      const b = (next as any)[k];
      if (Object.is(a, b)) stableKeys.push(k);
      else changedKeys.push(k);
    }
  
    return { equal: changedKeys.length === 0, changedKeys, stableKeys };
  }
  
  function isObject(v: any): v is Record<string, any> {
    return v !== null && typeof v === "object";
  }
  
  function keysOf(v: any): string[] {
    return isObject(v) ? Object.keys(v) : [];
  }
  