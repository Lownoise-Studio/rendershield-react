import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React, { StrictMode } from "react";
import { render, renderHook } from "@testing-library/react";
import {
  useRenderShield,
  useRenderShieldReport,
  withRenderShield,
  getShallowDiff,
  compareWatchedPaths,
  getAtPath,
  deepEqual,
} from "./index";
import { report, resetReportStateForTests } from "./report";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("package identity", () => {
  it("preserves npm package name and v1 version", () => {
    expect(pkg.name).toBe("@lownoise-studio/render-shield-react");
    expect(pkg.version).toBe("1.0.0");
    expect(pkg.peerDependencies.react).toBe(">=18");
    expect(pkg.bin).toBeUndefined();
    expect(pkg.dependencies).toBeUndefined();
  });

  it("does not declare a dependency on RenderShield Prerender", () => {
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    const serialized = JSON.stringify(lock);
    expect(serialized).not.toContain("@lownoise-studio/rendershield\"");
    expect(pkg.name).not.toBe("@lownoise-studio/rendershield");
  });
});

describe("public exports", () => {
  it("exposes the documented public surface from the source barrel", () => {
    expect(typeof useRenderShield).toBe("function");
    expect(typeof useRenderShieldReport).toBe("function");
    expect(useRenderShieldReport).toBe(useRenderShield);
    expect(typeof withRenderShield).toBe("function");
    expect(typeof getShallowDiff).toBe("function");
    expect(typeof compareWatchedPaths).toBe("function");
    expect(typeof getAtPath).toBe("function");
    expect(typeof deepEqual).toBe("function");
  });

  it("loads ESM and CJS built entries with the same export names", async () => {
    const esm = await import(pathToFileURL(join(root, "dist/index.mjs")).href);
    const cjs = require(join(root, "dist/index.js"));

    const expected = [
      "useRenderShield",
      "useRenderShieldReport",
      "withRenderShield",
      "getShallowDiff",
      "compareWatchedPaths",
      "getAtPath",
      "deepEqual",
    ];

    for (const key of expected) {
      expect(typeof esm[key]).toBe("function");
      expect(typeof cjs[key]).toBe("function");
    }

    for (const leaked of ["report", "resetReportStateForTests", "trackShieldEvaluation"]) {
      expect(keyIn(esm, leaked)).toBe(false);
      expect(keyIn(cjs, leaked)).toBe(false);
    }
  });
});

function keyIn(mod: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(mod, key);
}

describe("useRenderShield semantics", () => {
  beforeEach(() => resetReportStateForTests());
  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
  });

  it("stabilizes reference when watched paths are equal", () => {
    const first = { id: 1, meta: { t: "a" } };
    const second = { id: 1, meta: { t: "b" } };
    const { result, rerender } = renderHook(
      ({ value }) => useRenderShield(value, { watch: ["id"] }),
      { initialProps: { value: first } }
    );

    rerender({ value: second });
    expect(result.current).toBe(first);
  });

  it("returns current value when shield is false", () => {
    const first = { id: 1, meta: { t: "a" } };
    const second = { id: 1, meta: { t: "b" } };
    const { result, rerender } = renderHook(
      ({ value }) => useRenderShield(value, { watch: ["id"], shield: false }),
      { initialProps: { value: first } }
    );

    rerender({ value: second });
    expect(result.current).toBe(second);
  });

  it("documents watched-path staleness: unwatched fields on shielded value may be old", () => {
    const first = { id: 1, label: "old" };
    const second = { id: 1, label: "new" };
    const { result, rerender } = renderHook(
      ({ value }) => useRenderShield(value, { watch: ["id"] }),
      { initialProps: { value: first } }
    );

    rerender({ value: second });
    expect(result.current).toBe(first);
    expect(result.current.label).toBe("old");
    expect(second.label).toBe("new");
  });
});

describe("withRenderShield semantics", () => {
  it("prevents wrapped component execution when watched paths are stable", () => {
    let renders = 0;
    const Base = (props: { id: number; noise: string }) => {
      renders += 1;
      return <div>{props.id}</div>;
    };
    const Shielded = withRenderShield(Base, { watch: ["id"] });

    const { rerender } = render(<Shielded id={1} noise="a" />);
    rerender(<Shielded id={1} noise="b" />);
    expect(renders).toBe(1);
  });

  it("rerenders when shield is false even if comparison would equal", () => {
    let renders = 0;
    const Base = (props: { id: number; noise: string }) => {
      renders += 1;
      return <div>{props.id}</div>;
    };
    const Shielded = withRenderShield(Base, { watch: ["id"], shield: false });

    const { rerender } = render(<Shielded id={1} noise="a" />);
    rerender(<Shielded id={1} noise="b" />);
    expect(renders).toBe(2);
  });
});

describe("diagnostics gating and contracts", () => {
  beforeEach(() => resetReportStateForTests());
  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
    vi.restoreAllMocks();
  });

  it("does not emit console diagnostics in production", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});

    report({
      componentName: "ProdGate",
      shielded: true,
      renderCount: 2,
      changedKeys: ["meta"],
      stableKeys: ["id"],
      watchedChanged: [],
      watchedStable: ["id"],
      severity: "Changed (non-UI key)",
      visual: true,
    });
    await flushMicrotasks();

    expect(groupSpy).not.toHaveBeenCalled();
    expect(document.getElementById("render-shield-toast")).toBeNull();
    process.env.NODE_ENV = original;
  });

  it("reports contract compliance without false drift for parent-key changes", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    for (let i = 0; i < 3; i++) {
      report({
        componentName: "ContractCompat",
        shielded: true,
        renderCount: i + 2,
        changedKeys: ["user"],
        stableKeys: [],
        watchedChanged: [],
        watchedStable: ["user.id"],
        severity: "Changed (non-UI key)",
        contract: { watch: ["user.id"] },
      });
      await flushMicrotasks();
    }

    const logs = logSpy.mock.calls.flat().join(" ");
    expect(logs).toContain("Contract: ✓ Compliant");
    process.env.NODE_ENV = original;
  });

  it("is SSR-safe for visual HUD when document is absent", async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const held = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: undefined,
    });

    expect(() => {
      report({
        componentName: "SsrHud",
        shielded: true,
        renderCount: 2,
        changedKeys: [],
        stableKeys: ["id"],
        watchedChanged: [],
        watchedStable: ["id"],
        severity: "Stable",
        visual: true,
      });
    }).not.toThrow();

    await flushMicrotasks();
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: held,
    });
    process.env.NODE_ENV = original;
  });
});

describe("React Strict Mode", () => {
  beforeEach(() => resetReportStateForTests());
  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
    vi.restoreAllMocks();
  });

  it("keeps shielded reference stable under StrictMode remounts when watch paths match", () => {
    const value = { id: 1, noise: "x" };
    const { result } = renderHook(
      () => useRenderShield(value, { watch: ["id"] }),
      {
        wrapper: ({ children }) => <StrictMode>{children}</StrictMode>,
      }
    );

    expect(result.current).toBe(value);
    expect(result.current.id).toBe(1);
  });
});
