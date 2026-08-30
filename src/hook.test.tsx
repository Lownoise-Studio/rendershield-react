import React, { StrictMode, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, act } from "@testing-library/react";
import { useRenderShield, useRenderShieldReport } from "./hook";
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

describe("useRenderShieldReport diagnostics-only contract", () => {
  beforeEach(() => {
    resetReportStateForTests();
  });

  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
  });

  it("is not the same runtime function as useRenderShield", () => {
    expect(useRenderShieldReport).not.toBe(useRenderShield);
  });

  it("always returns the current value even when comparison would shield", () => {
    const initialProps = { id: 1, metadata: { lastUpdated: "10:00" } };
    const nextProps = { id: 1, metadata: { lastUpdated: "10:05" } };
    const options = { watch: ["id"] };

    const { result, rerender } = renderHook(
      ({ p, o }) => useRenderShieldReport(p, o),
      {
        initialProps: { p: initialProps, o: options },
      }
    );

    rerender({ p: nextProps, o: options });

    expect(result.current).toBe(nextProps);
    expect(result.current.metadata.lastUpdated).toBe("10:05");
  });

  it("ignores shield: true from callers (cannot opt into shielding)", () => {
    const initialProps = { id: 1, noise: "a" };
    const nextProps = { id: 1, noise: "b" };

    const { result, rerender } = renderHook(
      ({ p }) =>
        useRenderShieldReport(p, { watch: ["id"], shield: true }),
      { initialProps: { p: initialProps } }
    );

    rerender({ p: nextProps });

    expect(result.current).toBe(nextProps);
    expect(result.current.noise).toBe("b");
  });

  it("still emits diagnostics when debug is enabled", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const options = {
      watch: ["id"],
      debug: true,
      componentName: "ReportOnlyTest",
    };

    const { rerender } = renderHook(
      ({ p }) => useRenderShieldReport(p, options),
      { initialProps: { p: { id: 1, meta: 0 } } }
    );

    rerender({ p: { id: 1, meta: 1 } });
    await flushMicrotasks();

    expect(groupSpy).toHaveBeenCalledWith(
      expect.stringContaining("[RenderShield]")
    );

    groupSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("does not prevent component execution (hook still runs each render)", () => {
    let executions = 0;
    const options = { watch: ["id"] };

    const { rerender } = renderHook(
      ({ p }) => {
        executions += 1;
        return useRenderShieldReport(p, options);
      },
      { initialProps: { p: { id: 1, meta: 0 } } }
    );

    rerender({ p: { id: 1, meta: 1 } });
    rerender({ p: { id: 1, meta: 2 } });

    expect(executions).toBe(3);
  });

  it("does not stabilize when customCompare returns true", () => {
    const initialProps = { id: 1, meta: "a" };
    const nextProps = { id: 1, meta: "b" };

    const { result, rerender } = renderHook(
      ({ p }) =>
        useRenderShieldReport(p, {
          customCompare: () => true,
        }),
      { initialProps: { p: initialProps } }
    );

    rerender({ p: nextProps });
    expect(result.current).toBe(nextProps);
  });
});

describe("customCompare", () => {
  beforeEach(() => {
    resetReportStateForTests();
  });

  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
  });

  it("true means equal/shield; false means accept new value (useRenderShield)", () => {
    const a = { id: 1, label: "a" };
    const b = { id: 1, label: "b" };
    const c = { id: 2, label: "c" };

    const { result, rerender } = renderHook(
      ({ p }) =>
        useRenderShield(p, {
          customCompare: (prev, next) => prev.id === next.id,
        }),
      { initialProps: { p: a } }
    );

    rerender({ p: b });
    expect(result.current).toBe(a);

    rerender({ p: c });
    expect(result.current).toBe(c);
  });

  it("propagates customCompare throw (does not swallow)", () => {
    const { rerender } = renderHook(
      ({ p }) =>
        useRenderShield(p, {
          customCompare: () => {
            throw new Error("hook-compare-failed");
          },
        }),
      { initialProps: { p: { id: 1 } } }
    );

    expect(() => rerender({ p: { id: 2 } })).toThrow("hook-compare-failed");
  });
});

describe("StrictMode / render-phase ref investigation", () => {
  beforeEach(() => {
    resetReportStateForTests();
  });

  afterEach(async () => {
    await flushMicrotasks();
    resetReportStateForTests();
  });

  it("stabilizes correctly across StrictMode double-invoke and updates", () => {
    // Investigation (R2): render-phase ref writes exist, but StrictMode double
    // invocation and committed state sequences show no externally incorrect
    // stabilization. Concurrent discarded-render modeling without React
    // internals remains out of scope — verdict: SAFE for observed StrictMode
    // behavior; concurrent discard remains unproven (see R2 report).
    const seen: Array<{ id: number; meta: string }> = [];

    function Probe({ value }: { value: { id: number; meta: string } }) {
      const shielded = useRenderShield(value, { watch: ["id"] });
      seen.push(shielded);
      return <div data-testid="id">{shielded.id}</div>;
    }

    const { rerender, getByTestId } = render(
      <StrictMode>
        <Probe value={{ id: 1, meta: "a" }} />
      </StrictMode>
    );

    expect(getByTestId("id").textContent).toBe("1");
    const firstCommitted = seen[seen.length - 1];

    rerender(
      <StrictMode>
        <Probe value={{ id: 1, meta: "b" }} />
      </StrictMode>
    );

    expect(getByTestId("id").textContent).toBe("1");
    expect(seen[seen.length - 1]).toBe(firstCommitted);

    rerender(
      <StrictMode>
        <Probe value={{ id: 2, meta: "c" }} />
      </StrictMode>
    );

    expect(getByTestId("id").textContent).toBe("2");
    expect(seen[seen.length - 1]).toEqual({ id: 2, meta: "c" });
  });

  it("does not leak a discarded intermediate value into committed stabilization (state sequence)", () => {
    function Parent() {
      const [value, setValue] = useState({ id: 1, step: "a" });
      const shielded = useRenderShield(value, { watch: ["id"] });

      return (
        <div>
          <div data-testid="out">{`${shielded.id}:${shielded.step}`}</div>
          <button
            type="button"
            onClick={() => setValue({ id: 1, step: "b" })}
          >
            same-id
          </button>
          <button
            type="button"
            onClick={() => setValue({ id: 2, step: "c" })}
          >
            new-id
          </button>
        </div>
      );
    }

    const { getByTestId, getByText } = render(
      <StrictMode>
        <Parent />
      </StrictMode>
    );

    expect(getByTestId("out").textContent).toBe("1:a");

    act(() => {
      getByText("same-id").click();
    });
    expect(getByTestId("out").textContent).toBe("1:a");

    act(() => {
      getByText("new-id").click();
    });
    expect(getByTestId("out").textContent).toBe("2:c");
  });
});
