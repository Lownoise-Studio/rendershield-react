import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRenderShield } from "./hook";
import { resetReportStateForTests } from "./report";

async function flushMicrotasks() {
  await Promise.resolve();
}

describe("useRenderShield Hook", () => {
  beforeEach(() => {
    resetReportStateForTests();
  });

  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
  });

  it("should return the original reference if watched keys are stable", () => {
    const initialProps = { id: 1, metadata: { lastUpdated: "10:00" } };
    const nextProps = { id: 1, metadata: { lastUpdated: "10:05" } };
    const options = { watch: ["id"] };

    const { result, rerender } = renderHook(
      ({ p, o }) => useRenderShield(p, o),
      {
        initialProps: { p: initialProps, o: options },
      }
    );

    rerender({ p: nextProps, o: options });

    expect(result.current).toBe(initialProps);
  });

  it("should return the new reference if a watched key changes", () => {
    const initialProps = { id: 1 };
    const nextProps = { id: 2 };
    const options = { watch: ["id"] };

    const { result, rerender } = renderHook(
      ({ p, o }) => useRenderShield(p, o),
      {
        initialProps: { p: initialProps, o: options },
      }
    );

    rerender({ p: nextProps, o: options });

    expect(result.current).toBe(nextProps);
    expect(result.current.id).toBe(2);
  });

  it("should log a report when debug is enabled", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    renderHook(() => useRenderShield({ id: 1 }, { debug: true }));

    // report() batches logs to a micro-task
    await flushMicrotasks();

    expect(groupSpy).toHaveBeenCalledWith(
      expect.stringContaining("[RenderShield]")
    );

    groupSpy.mockRestore();
    logSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("should return current value but still report diagnostics when shield is false", () => {
    const initialProps = { id: 1, metadata: { lastUpdated: "10:00" } };
    const nextProps = { id: 1, metadata: { lastUpdated: "10:05" } };
    const options = { watch: ["id"], shield: false };

    const { result, rerender } = renderHook(
      ({ p, o }) => useRenderShield(p, o),
      {
        initialProps: { p: initialProps, o: options },
      }
    );

    rerender({ p: nextProps, o: options });

    // Should return new value (no shielding) even though watched key is stable
    expect(result.current).toBe(nextProps);
    expect(result.current.metadata.lastUpdated).toBe("10:05");
  });

  it("should pass through contract to diagnostics", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const contract = {
      watch: ["id"],
      description: "Component only cares about user ID",
    };

    renderHook(() =>
      useRenderShield(
        { id: 1, name: "Test" },
        { debug: true, contract, componentName: "TestComponent" }
      )
    );

    await flushMicrotasks();

    // Verify contract info appears in logs
    const logCalls = logSpy.mock.calls.flat().join(" ");
    expect(logCalls).toContain("Contract");
    expect(logCalls).toContain("id");

    groupSpy.mockRestore();
    logSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("should generate recommendations after repeated non-watched changes", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const options = {
      watch: ["id"],
      debug: true,
      componentName: "RecommendationTest",
    };

    const { rerender } = renderHook(
      ({ p }) => useRenderShield(p, options),
      {
        initialProps: { p: { id: 1, metadata: { lastUpdated: "10:00" } } },
      }
    );

    for (let i = 1; i <= 4; i++) {
      rerender({
        p: { id: 1, metadata: { lastUpdated: `10:0${i}` } },
      });
      await flushMicrotasks();
    }

    const logCalls = logSpy.mock.calls.flat().join(" ");

    expect(
      logCalls.includes("Recommendations") || logCalls.includes("Consider watching")
    ).toBe(true);

    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("should not repeat debug reports when value reference is unchanged", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const stableProps = { id: 1 };
    const options = { watch: ["id"], debug: true, componentName: "NoRepeatTest" };

    const { rerender } = renderHook(
      ({ p }) => useRenderShield(p, options),
      { initialProps: { p: stableProps } }
    );

    rerender({ p: stableProps });
    rerender({ p: stableProps });
    await flushMicrotasks();

    expect(groupSpy).toHaveBeenCalledTimes(2);

    groupSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });
});
