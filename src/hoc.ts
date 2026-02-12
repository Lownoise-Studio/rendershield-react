import React from "react";
import type { RenderShieldOptions } from "./types";
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
    // Custom comparator wins (user-owned)
    if (typeof opts.customCompare === "function") {
      const equal = opts.customCompare(prevProps, nextProps);

      if (opts.debug) {
        report({
          componentName: name,
          shielded: equal,
          renderCount: NaN, // comparator is not a render, so we avoid lying
          changedKeys: [],
          stableKeys: [],
          watchedChanged: [],
          watchedStable: [],
          severity: "Custom compare triggered",
        });
      }

      return equal;
    }

    const shallow = getShallowDiff(prevProps, nextProps);

    if (opts.watch && opts.watch.length > 0) {
      const watched = compareWatchedPaths(prevProps, nextProps, opts.watch);
      const equal = watched.watchedEqual;

      if (opts.debug) {
        report({
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
        });
      }

      return equal;
    }

    if (opts.debug) {
      report({
        componentName: name,
        shielded: shallow.equal,
        renderCount: NaN,
        changedKeys: shallow.changedKeys,
        stableKeys: shallow.stableKeys,
        watchedChanged: [],
        watchedStable: [],
        severity: shallow.changedKeys.length > 0 ? "Changed (non-UI key)" : "Stable",
      });
    }

    return shallow.equal;
  });

  Memo.displayName = `withRenderShield(${name})`;
  return Memo;
}
