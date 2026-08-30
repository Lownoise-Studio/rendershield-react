// src/hook.ts

import { useRef } from "react";
import type { RenderShieldDiff, RenderShieldOptions } from "./types";
import { getShallowDiff } from "./shallowCompare";
import { compareWatchedPaths } from "./pathCompare";
import { report, getReportBatchKey, trackShieldEvaluation, shouldSurfaceRecommendations } from "./report";

/** Internal uninitialized marker — must not collide with any legitimate T (incl. null). */
const UNINITIALIZED: unique symbol = Symbol("render-shield-uninitialized");
type PrevSlot<T> = T | typeof UNINITIALIZED;

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

  const prevRef = useRef<PrevSlot<T>>(UNINITIALIZED);
  const renderCountRef = useRef(0);
  const lastReportKeyRef = useRef<string | null>(null);
  const recommendationsSurfacedRef = useRef(false);

  renderCountRef.current += 1;
  const renderCount = renderCountRef.current;
  const prev = prevRef.current;

  if (prev === UNINITIALIZED) {
    prevRef.current = value;
    if (opts.debug) {
      reportDiffIfNew(buildInitialDiff(value, opts, renderCount), lastReportKeyRef, recommendationsSurfacedRef);
    }
    return value;
  }

  const evaluation = evaluateShield(prev, value, opts, renderCount);

  if (opts.debug && evaluation.diff) {
    reportDiffIfNew(evaluation.diff, lastReportKeyRef, recommendationsSurfacedRef);
  }

  const shouldShield = opts.shield !== false && evaluation.shielded;

  if (shouldShield) {
    return prevRef.current as T;
  }

  prevRef.current = value;
  return value;
}

/**
 * Diagnostics-only companion to useRenderShield.
 *
 * Always forces `shield: false` so the current value is returned even when
 * comparison would otherwise stabilize to a previous reference. Callers cannot
 * opt back into shielding via options — that would violate the public contract.
 * Diagnostics still run when `debug: true`.
 */
export function useRenderShieldReport<T>(
  value: T,
  options?: RenderShieldOptions<T>
): T {
  return useRenderShield(value, { ...options, shield: false });
}

function reportDiffIfNew(
  diff: RenderShieldDiff,
  lastReportKeyRef: { current: string | null },
  recommendationsSurfacedRef: { current: boolean }
) {
  trackShieldEvaluation(diff);

  const key = getReportBatchKey(diff);
  const surfaceRecommendations =
    !recommendationsSurfacedRef.current && shouldSurfaceRecommendations(diff);

  if (lastReportKeyRef.current === key && !surfaceRecommendations) return;

  if (surfaceRecommendations) {
    recommendationsSurfacedRef.current = true;
  }

  lastReportKeyRef.current = key;
  report(diff);
}

function buildInitialDiff<T>(
  value: T,
  opts: RenderShieldOptions<T>,
  renderCount: number
): RenderShieldDiff {
  const stableKeys =
    value && typeof value === "object" ? Object.keys(value as object) : [];

  return {
    componentName: opts.componentName,
    shielded: false,
    renderCount,
    changedKeys: [],
    stableKeys,
    watchedChanged: [],
    watchedStable: opts.watch ?? [],
    severity: "Stable",
    visual: !!opts.visual,
    contract: opts.contract,
  };
}

function evaluateShield<T>(
  prev: T,
  value: T,
  opts: RenderShieldOptions<T>,
  renderCount: number
): { shielded: boolean; diff: RenderShieldDiff } {
  if (typeof opts.customCompare === "function") {
    const shielded = opts.customCompare(prev, value);

    return {
      shielded,
      diff: {
        componentName: opts.componentName,
        shielded,
        renderCount,
        changedKeys: [],
        stableKeys: [],
        watchedChanged: [],
        watchedStable: opts.watch ?? [],
        severity: "Custom compare triggered",
        visual: !!opts.visual,
        contract: opts.contract,
      },
    };
  }

  const shallow = safeShallow(prev, value);
  const { changedKeys, stableKeys } = shallow;

  if (opts.watch && opts.watch.length > 0) {
    const watched = compareWatchedPaths(prev, value, opts.watch);
    const shielded = watched.watchedEqual;

    return {
      shielded,
      diff: {
        componentName: opts.componentName,
        shielded,
        renderCount,
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
        contract: opts.contract,
      },
    };
  }

  const shielded = shallow.equal;

  return {
    shielded,
    diff: {
      componentName: opts.componentName,
      shielded,
      renderCount,
      changedKeys,
      stableKeys,
      watchedChanged: [],
      watchedStable: [],
      severity: changedKeys.length > 0 ? "Changed (non-UI key)" : "Stable",
      visual: !!opts.visual,
      contract: opts.contract,
    },
  };
}

function safeShallow(prev: unknown, next: unknown) {
  try {
    return getShallowDiff(prev, next);
  } catch {
    return { equal: false, changedKeys: ["(unavailable)"], stableKeys: [] as string[] };
  }
}
