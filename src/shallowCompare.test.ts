import { describe, it, expect } from "vitest";
import { getShallowDiff } from "./shallowCompare";

describe("getShallowDiff", () => {
  it("returns equal for same reference", () => {
    const obj = { a: 1, b: 2 };
    const result = getShallowDiff(obj, obj);
    expect(result.equal).toBe(true);
    expect(result.changedKeys).toEqual([]);
    expect(result.stableKeys).toEqual(["a", "b"]);
  });

  it("detects changed top-level keys", () => {
    const result = getShallowDiff({ a: 1, b: 2 }, { a: 1, b: 3 });
    expect(result.equal).toBe(false);
    expect(result.changedKeys).toEqual(["b"]);
    expect(result.stableKeys).toEqual(["a"]);
  });

  it("treats nested reference changes as stable shallow keys", () => {
    const nested = { x: 1 };
    const result = getShallowDiff({ value: nested }, { value: { x: 1 } });
    expect(result.equal).toBe(false);
    expect(result.changedKeys).toEqual(["value"]);
  });

  it("handles primitives", () => {
    expect(getShallowDiff(1, 1).equal).toBe(true);
    expect(getShallowDiff(1, 2).equal).toBe(false);
    expect(getShallowDiff(1, 2).changedKeys).toEqual(["(value)"]);
  });

  it("detects added and removed keys", () => {
    const result = getShallowDiff({ a: 1 }, { a: 1, b: 2 });
    expect(result.equal).toBe(false);
    expect(result.changedKeys).toEqual(["b"]);
    expect(result.stableKeys).toEqual(["a"]);
  });
});
