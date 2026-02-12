import { useMemo, useRef } from "react";
import type { RenderShieldOptions, RenderShieldDiff } from "./types";
import { getShallowDiff } from "./shallowCompare";
import { compareWatchedPaths } from "./pathCompare";
import { report } from "./report";

export function useRenderShield<T>(
  props: T,
  options?: RenderShieldOptions<T>
): T {
  const opts = options ?? {};
  const prevRef = useRef<T | null>(null);
  const renderCountRef = useRef(0);

  renderCountRef.current += 1;

  const prev = prevRef.current;

  const decided = useMemo(() => {
    // First render: accept incoming props.
    // IMPORTANT: we still run useMemo so hook order is stable.
    if (prev === null) {
      return {
        shielded: false,
        nextValue: props,
        shouldReportInitial: Boolean(opts.debug),
        initialDiff: {
          componentName: undefined,
          shielded: false,
          renderCount: renderCountRef.current,
          changedKeys: [],
          stableKeys: Object.keys((props as any) ?? {}),
          watchedChanged: [],
          watchedStable: opts.watch ?? [],
          severity: "Stable",
        } satisfies RenderShieldDiff,
      };
    }

    // 1) Custom comparator wins (user-owned)
    if (typeof opts.customCompare === "function") {
      const equal = opts.customCompare(prev, props);

      return {
        shielded: equal,
        nextValue: equal ? prev : props,
        shouldReportInitial: false,
        diff: buildDiff(prev, props, opts, renderCountRef.current, equal, true),
      };
    }

    // 2) Default shallow compare
    const shallow = getShallowDiff(prev as any, props as any);

    // 3) Optional path-targeted deep compare for watch paths
    if (opts.watch && opts.watch.length > 0) {
      const watched = compareWatchedPaths(prev, props, opts.watch);

      // Decision rule:
      // - If watched paths are equal, we can shield even if unrelated keys changed
      // - Otherwise, do not shield
      const equal = watched.watchedEqual;

      return {
        shielded: equal,
        nextValue: equal ? prev : props,
        shouldReportInitial: false,
        diff: buildDiff(
          prev,
          props,
          opts,
          renderCountRef.current,
          equal,
          false,
          shallow,
          watched
        ),
      };
    }

    // No watch paths: shallow equality decides
    return {
      shielded: shallow.equal,
      nextValue: shallow.equal ? prev : props,
      shouldReportInitial: false,
      diff: buildDiff(
        prev,
        props,
        opts,
        renderCountRef.current,
        shallow.equal,
        false,
        shallow
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props, opts.watch?.join("|"), opts.debug, opts.customCompare]);

  // First render commit: store props AFTER memo runs (same render, safe)
  if (prev === null) {
    prevRef.current = props;

    if (decided.shouldReportInitial && (decided as any).initialDiff) {
      report((decided as any).initialDiff);
    }

    return props;
  }

  // Debug reporting (non-initial renders)
  if (opts.debug && (decided as any).diff) {
    report((decided as any).diff);
  }

  if (decided.shielded) {
    // Keep prevRef as-is (shield)
    return prevRef.current as T;
  }

  // Accept new props
  prevRef.current = props;
  return props;
}

function buildDiff<T>(
  prev: T,
  next: T,
  opts: RenderShieldOptions<T>,
  renderCount: number,
  equal: boolean,
  usedCustom: boolean,
  shallow?: { changedKeys: string[]; stableKeys: string[] },
  watched?: { watchedChanged: string[]; watchedStable: string[] }
): RenderShieldDiff {
  const changedKeys =
    shallow?.changedKeys ?? safeTopKeysDiff(prev, next).changedKeys;
  const stableKeys =
    shallow?.stableKeys ?? safeTopKeysDiff(prev, next).stableKeys;

  const watchedChanged = watched?.watchedChanged ?? [];
  const watchedStable = watched?.watchedStable ?? [];

  const severity = usedCustom
    ? "Custom compare triggered"
    : watched && watchedChanged.length > 0
      ? "Changed (watched key)"
      : changedKeys.length > 0
        ? "Changed (non-UI key)"
        : "Stable";

  return {
    componentName: undefined,
    shielded: equal,
    renderCount,
    changedKeys,
    stableKeys,
    watchedChanged,
    watchedStable,
    severity,
  };
}

function safeTopKeysDiff(prev: any, next: any) {
  try {
    return getShallowDiff(prev, next);
  } catch {
    return { equal: false, changedKeys: ["(unavailable)"], stableKeys: [] };
  }
}
