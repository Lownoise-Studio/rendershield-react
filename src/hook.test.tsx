import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRenderShield } from "./hook";

async function flushMicrotasks() {
  await Promise.resolve();
}

describe("useRenderShield Hook", () => {
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
});
