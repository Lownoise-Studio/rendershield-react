import React from "react";
import type { RenderShieldDiff, RenderShieldOptions } from "./types";
import { getShallowDiff } from "./shallowCompare";
import { compareWatchedPaths } from "./pathCompare";
import { report } from "./report";

export function withRenderShield<P extends object>(
  Component: React.ComponentType<P>,
  options?: RenderShieldOptions<P>
) {
  const opts = options ?? {};
  const name = Component.displayName || Component.name || "Component";

  const Memo = React.memo(Component, (prevProps, nextProps) => {
    const comparison = evaluateProps(prevProps, nextProps, opts, name);

    if (opts.debug) {
      report(comparison.diff);
    }

    if (opts.shield === false) {
      return false;
    }

    return comparison.equal;
  });

  Memo.displayName = `withRenderShield(${name})`;
  return Memo;
}

function evaluateProps<P extends object>(
  prevProps: P,
  nextProps: P,
  opts: RenderShieldOptions<P>,
  name: string
): { equal: boolean; diff: RenderShieldDiff } {
  if (typeof opts.customCompare === "function") {
    const equal = opts.customCompare(prevProps, nextProps);

    return {
      equal,
      diff: {
        componentName: name,
        shielded: equal,
        renderCount: NaN,
        changedKeys: [],
        stableKeys: [],
        watchedChanged: [],
        watchedStable: [],
        severity: "Custom compare triggered",
        visual: !!opts.visual,
        contract: opts.contract,
      },
    };
  }

  const shallow = getShallowDiff(prevProps, nextProps);

  if (opts.watch && opts.watch.length > 0) {
    const watched = compareWatchedPaths(prevProps, nextProps, opts.watch);
    const equal = watched.watchedEqual;

    return {
      equal,
      diff: {
        componentName: name,
        shielded: equal,
        renderCount: NaN,
        changedKeys: shallow.changedKeys,
        stableKeys: shallow.stableKeys,
        watchedChanged: watched.watchedChanged,
        watchedStable: watched.watchedStable,
        severity:
          watched.watchedChanged.length > 0
            ? "Changed (watched key)"
            : shallow.changedKeys.length > 0
              ? "Changed (non-UI key)"
              : "Stable",
        visual: !!opts.visual,
        contract: opts.contract,
      },
    };
  }

  return {
    equal: shallow.equal,
    diff: {
      componentName: name,
      shielded: shallow.equal,
      renderCount: NaN,
      changedKeys: shallow.changedKeys,
      stableKeys: shallow.stableKeys,
      watchedChanged: [],
      watchedStable: [],
      severity: shallow.changedKeys.length > 0 ? "Changed (non-UI key)" : "Stable",
      visual: !!opts.visual,
      contract: opts.contract,
    },
  };
}
