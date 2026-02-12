import type { RenderShieldDiff } from "./types";

/**
 * Dev-only reporter with micro-task batching.
 *
 * Goal:
 * - Collapse repeated reports for the same "logical event" within one micro-task.
 * - Reduce Strict Mode double-invoke noise without relying on React internals.
 *
 * Notes:
 * - This does NOT hide legitimate later renders (different ticks).
 * - This does NOT mutate inputs.
 * - Production logs remain disabled.
 */

type Pending = {
  key: string;
  diff: RenderShieldDiff;
};

let pendingReports: Map<string, Pending> = new Map();
let isBatching = false;

export function report(diff: RenderShieldDiff) {
  const isProd =
    typeof process !== "undefined" &&
    process.env &&
    process.env.NODE_ENV === "production";

  if (isProd) return;

  const key = buildBatchKey(diff);

  // Store latest diff for this key in the current micro-task.
  pendingReports.set(key, { key, diff });

  if (!isBatching) {
    isBatching = true;
    Promise.resolve().then(flush);
  }
}

function flush() {
  for (const { diff } of pendingReports.values()) {
    renderLog(diff);
  }
  pendingReports.clear();
  isBatching = false;
}

function renderLog(diff: RenderShieldDiff) {
  const name = diff.componentName ? `<${diff.componentName}>` : "<Component>";
  const title = `[RenderShield] ${name}`;

  console.groupCollapsed(title);
  console.log("Shielded:", diff.shielded);
  console.log("Render count:", diff.renderCount);
  console.log("Changed:", diff.changedKeys);
  console.log("Stable:", diff.stableKeys);

  if (diff.watchedChanged.length || diff.watchedStable.length) {
    console.log("Watched changed:", diff.watchedChanged);
    console.log("Watched stable:", diff.watchedStable);
  }

  console.log("Severity:", diff.severity);
  console.groupEnd();
}

/**
 * Build a best-effort batching key.
 *
 * Why not only componentName?
 * - Hook reports often omit componentName.
 * - Multiple instances of same componentName can render in the same tick.
 *
 * This key aims to collapse genuinely duplicated logs within a micro-task
 * while avoiding accidental overwrites of unrelated anonymous reports.
 */
function buildBatchKey(diff: RenderShieldDiff): string {
  const base = diff.componentName ?? "Anonymous";

  // Include minimal, factual signature of the report.
  // This is not "magic": it is derived from the report content itself.
  const signature = [
    diff.shielded ? "S1" : "S0",
    diff.severity,
    diff.changedKeys.join(","),
    "|W|",
    diff.watchedChanged.join(","),
  ].join(":");

  return `${base}::${signature}`;
}
