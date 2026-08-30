import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  report,
  getReportBatchKey,
  resetReportStateForTests,
} from "./report";
import type { RenderShieldDiff } from "./types";

async function flushMicrotasks() {
  await Promise.resolve();
}

function baseDiff(overrides: Partial<RenderShieldDiff> = {}): RenderShieldDiff {
  return {
    shielded: false,
    renderCount: 1,
    changedKeys: [],
    stableKeys: [],
    watchedChanged: [],
    watchedStable: [],
    severity: "Stable",
    ...overrides,
  };
}

describe("report", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resetReportStateForTests();
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
    resetReportStateForTests();
  });

  it("does nothing in production", async () => {
    process.env.NODE_ENV = "production";
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});

    report(baseDiff({ componentName: "ProdTest" }));
    await flushMicrotasks();

    expect(groupSpy).not.toHaveBeenCalled();
  });

  it("batches duplicate reports within a microtask", async () => {
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const diff = baseDiff({ componentName: "BatchTest", changedKeys: ["id"] });
    report(diff);
    report(diff);
    await flushMicrotasks();

    expect(groupSpy).toHaveBeenCalledTimes(1);
  });

  it("builds stable batch keys from diff content", () => {
    const diff = baseDiff({
      componentName: "KeyTest",
      shielded: true,
      changedKeys: ["user"],
      watchedChanged: [],
      severity: "Changed (non-UI key)",
    });

    expect(getReportBatchKey(diff)).toBe(
      "KeyTest::S1:Changed (non-UI key):user:|W|:"
    );
  });

  it("does not flag contract drift when only parent refs change", async () => {
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const historyDiff = baseDiff({
      componentName: "ContractTest",
      changedKeys: ["user"],
      watchedStable: ["user.id"],
      watchedChanged: [],
      contract: { watch: ["user.id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(historyDiff);
      await flushMicrotasks();
    }

    const logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract: ✓ Compliant");
    expect(logCalls).not.toContain("Contract specifies");
    expect(groupSpy).toHaveBeenCalled();
  });

  it("flags contract drift for unrelated shallow keys", async () => {
    const groupSpy = vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const historyDiff = baseDiff({
      componentName: "DriftTest",
      changedKeys: ["name"],
      watchedStable: ["user.id"],
      watchedChanged: [],
      contract: { watch: ["user.id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(historyDiff);
      await flushMicrotasks();
    }

    const logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract: ⚠ Drift");
    expect(logCalls).toContain("Contract specifies [user.id] but [name] changed");
    expect(groupSpy).toHaveBeenCalled();
  });

  it("does not flag drift when a declared contract path itself changes", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const historyDiff = baseDiff({
      componentName: "ContractPathChange",
      changedKeys: ["user"],
      watchedChanged: ["user.id"],
      watchedStable: [],
      contract: { watch: ["user.id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(historyDiff);
      await flushMicrotasks();
    }

    const logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract: ✓ Compliant");
    expect(logCalls).not.toContain("Contract specifies [user.id] but [user.id] changed");
  });

  it("reports multiple out-of-contract keys in deterministic order", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const historyDiff = baseDiff({
      componentName: "MultiDrift",
      changedKeys: ["name", "role"],
      watchedChanged: ["meta.flag"],
      watchedStable: ["user.id"],
      contract: { watch: ["user.id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(historyDiff);
      await flushMicrotasks();
    }

    const logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain(
      "Contract specifies [user.id] but [name, role, meta.flag] changed"
    );
  });

  it("treats equivalent path syntax as the same declared contract path", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const bracketContract = baseDiff({
      componentName: "PathSyntaxBracket",
      changedKeys: ["items"],
      watchedChanged: ["items.0.id"],
      watchedStable: [],
      contract: { watch: ["items[0].id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(bracketContract);
      await flushMicrotasks();
    }

    let logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract: ✓ Compliant");
    expect(logCalls).not.toContain("Contract specifies");

    logSpy.mockClear();
    resetReportStateForTests();

    const dottedContract = baseDiff({
      componentName: "PathSyntaxDotted",
      changedKeys: ["items"],
      watchedChanged: ["items[0].id"],
      watchedStable: [],
      contract: { watch: ["items.0.id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(dottedContract);
      await flushMicrotasks();
    }

    logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract: ✓ Compliant");
    expect(logCalls).not.toContain("Contract specifies");
  });

  it("documents limitation: sibling nested change under contracted root is not drift", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    // Same payload as parent-ref-only: cannot distinguish user.name sibling change.
    const historyDiff = baseDiff({
      componentName: "SiblingLimitation",
      changedKeys: ["user"],
      watchedChanged: [],
      watchedStable: ["user.id"],
      contract: { watch: ["user.id"] },
    });

    for (let i = 0; i < 3; i++) {
      report(historyDiff);
      await flushMicrotasks();
    }

    const logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract: ✓ Compliant");
    expect(logCalls).not.toContain("Contract specifies");
  });

  it("escapes HTML in visual toast content", async () => {
    const appendSpy = vi.spyOn(document.body, "appendChild");
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    report(
      baseDiff({
        componentName: "<script>",
        shielded: true,
        visual: true,
        severity: "Stable",
      })
    );
    await flushMicrotasks();

    const toast = appendSpy.mock.calls
      .map((call) => call[0] as HTMLElement)
      .find((node) => node.id === "render-shield-toast");

    expect(toast?.innerHTML).toContain("&lt;script&gt;");
    expect(toast?.innerHTML).not.toContain("<script>");

    toast?.remove();
  });
});
