// src/hook.ts

import { useMemo, useRef } from "react";
import type { RenderShieldDiff, RenderShieldOptions } from "./types";
import { getShallowDiff } from "./shallowCompare";
import { compareWatchedPaths } from "./pathCompare";
import { report } from "./report";

/**
 * useRenderShield
 * - Shields by returning the previous value when the selected comparison says "equal".
 * - Emits dev-only diagnostics when options.debug === true
 *
 * v0.3.0:
 * - options.visual enables the dev HUD toast (only when shielded).
 * - visual flag is carried into the report diff, so report.ts can decide.
 */
export function useRenderShield<T>(value: T, options?: RenderShieldOptions<T>): T {
  const opts = options ?? {};

  const prevRef = useRef<T | null>(null);
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const prev = prevRef.current;

  const evaluation = useMemo(() => {
    // Initial render: do not shield.
    if (prev === null) {
      const stableKeys =
        value && typeof value === "object"
          ? Object.keys(value as any)
          : [];

      const initialDiff: RenderShieldDiff = {
        componentName: opts.componentName,
        shielded: false,
        renderCount: renderCountRef.current,
        changedKeys: [],
        stableKeys,
        watchedChanged: [],
        watchedStable: opts.watch ?? [],
        severity: "Stable",
        visual: !!opts.visual,
      };

      return {
        shielded: false,
        nextValue: value,
        shouldReportInitial: !!opts.debug,
        initialDiff,
        diff: undefined as RenderShieldDiff | undefined,
      };
    }

    // Custom comparator path
    if (typeof opts.customCompare === "function") {
      const shielded = opts.customCompare(prev as T, value);

      const diff: RenderShieldDiff = {
        componentName: opts.componentName,
        shielded,
        renderCount: renderCountRef.current,
        changedKeys: [],
        stableKeys: [],
        watchedChanged: [],
        watchedStable: opts.watch ?? [],
        severity: "Custom compare triggered",
        visual: !!opts.visual,
      };

      return {
        shielded,
        nextValue: shielded ? (prev as T) : value,
        shouldReportInitial: false,
        initialDiff: undefined,
        diff,
      };
    }

    // Default shallow diff
    const shallow = safeShallow(prev as T, value);
    const changedKeys = shallow.changedKeys;
    const stableKeys = shallow.stableKeys;

    // Watch paths mode: shield based on watched paths equality (deep path compare).
    if (opts.watch && opts.watch.length > 0) {
      const watched = compareWatchedPaths(prev as any, value as any, opts.watch);
      const shielded = watched.watchedEqual;

      const diff: RenderShieldDiff = {
        componentName: opts.componentName,
        shielded,
        renderCount: renderCountRef.current,
        changedKeys,
        stableKeys,
        watchedChanged: watched.watchedChanged,
        watchedStable: watched.watchedStable,
        severity:
          watched.watchedChanged.length > 0
            ? "Changed (watched key)"
            : changedKeys.length > 0
              ? "Changed (non-UI key)"
              : "Stable",
        visual: !!opts.visual,
      };

      return {
        shielded,
        nextValue: shielded ? (prev as T) : value,
        shouldReportInitial: false,
        initialDiff: undefined,
        diff,
      };
    }

    // Plain shallow equality mode
    const shielded = shallow.equal;

    const diff: RenderShieldDiff = {
      componentName: opts.componentName,
      shielded,
      renderCount: renderCountRef.current,
      changedKeys,
      stableKeys,
      watchedChanged: [],
      watchedStable: [],
      severity: changedKeys.length > 0 ? "Changed (non-UI key)" : "Stable",
      visual: !!opts.visual,
    };

    return {
      shielded,
      nextValue: shielded ? (prev as T) : value,
      shouldReportInitial: false,
      initialDiff: undefined,
      diff,
    };
  }, [
    value,
    opts.componentName,
    opts.debug,
    opts.visual,
    opts.customCompare,
    opts.watch?.join("|"),
  ]);

  // First render
  if (prev === null) {
    prevRef.current = value;
    if (evaluation.shouldReportInitial && evaluation.initialDiff) {
      report(evaluation.initialDiff);
    }
    return value;
  }

  // Debug reporting (dev-only is handled inside report.ts)
  if (opts.debug && evaluation.diff) {
    report(evaluation.diff);
  }

  // Shielding behavior
  if (evaluation.shielded) {
    // keep prev
    return prevRef.current as T;
  } else {
    prevRef.current = value;
    return value;
  }
}

function safeShallow(prev: any, next: any) {
  try {
    return getShallowDiff(prev, next);
  } catch {
    return { equal: false, changedKeys: ["(unavailable)"], stableKeys: [] as string[] };
  }
}
