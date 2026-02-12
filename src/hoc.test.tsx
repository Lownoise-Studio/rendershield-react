import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { withRenderShield } from "./hoc";

async function flushMicrotasks() {
  await Promise.resolve();
}

describe("withRenderShield HOC", () => {
  it("should NOT rerender the wrapped component when watched paths are stable (shielded)", () => {
    let renders = 0;

    const Base = (props: { id: number; metadata: { lastUpdated: string } }) => {
      renders += 1;
      return (
        <div>
          {props.id} - {props.metadata.lastUpdated}
        </div>
      );
    };

    const Shielded = withRenderShield(Base, { watch: ["id"] });

    const initialProps = { id: 1, metadata: { lastUpdated: "10:00" } };
    const nextProps = { id: 1, metadata: { lastUpdated: "10:05" } };

    const { rerender } = render(<Shielded {...initialProps} />);
    expect(renders).toBe(1);

    rerender(<Shielded {...nextProps} />);

    expect(renders).toBe(1);
  });

  it("should rerender the wrapped component when a watched path changes (not shielded)", () => {
    let renders = 0;

    const Base = (props: { id: number }) => {
      renders += 1;
      return <div>{props.id}</div>;
    };

    const Shielded = withRenderShield(Base, { watch: ["id"] });

    const { rerender } = render(<Shielded id={1} />);
    expect(renders).toBe(1);

    rerender(<Shielded id={2} />);

    expect(renders).toBe(2);
  });

  it("should follow shallow comparison when no watch paths are provided", () => {
    let renders = 0;

    const Base = (props: { value: { x: number } }) => {
      renders += 1;
      return <div>{props.value.x}</div>;
    };

    const Shielded = withRenderShield(Base);

    const { rerender } = render(<Shielded value={{ x: 1 }} />);
    expect(renders).toBe(1);

    rerender(<Shielded value={{ x: 1 }} />);
    expect(renders).toBe(2);
  });

  it("should log a report when debug is enabled (dev mode)", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    let renders = 0;
    const Base = (props: { id: number }) => {
      renders += 1;
      return <div>{props.id}</div>;
    };

    const Shielded = withRenderShield(Base, { watch: ["id"], debug: true });

    const { rerender } = render(<Shielded id={1} />);
    expect(renders).toBe(1);

    rerender(<Shielded id={2} />);
    expect(renders).toBe(2);

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
