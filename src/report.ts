// src/report.ts

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
 *
 * v0.3.0:
 * - Optional built-in visual toast (dev HUD) when diff.visual === true and diff.shielded === true.
 * - Toast triggers during flush() only (respects micro-task dedupe).
 * - SSR-safe guards.
 *
 * v0.4.0:
 * - Recommendations generation based on pattern analysis (low-noise: >= 3 occurrences).
 * - Component contract compliance reporting.
 * - Enhanced console output with summary statistics.
 */

type Pending = {
  key: string;
  diff: RenderShieldDiff;
};

let pendingReports: Map<string, Pending> = new Map();
let isBatching = false;

// History tracking for recommendations (dev-only, in-memory)
// Key: componentName, Value: array of last 10 diffs (FIFO)
// 
// Scoping: Module-level Map shared across all imports/React roots.
// This is intentional for dev diagnostics - allows cross-root pattern analysis.
// Component identity: Uses componentName from opts.componentName (hook) or Component.name/displayName (HOC).
// Fallback "Anonymous" means multiple unnamed components share history - acceptable for dev diagnostics.
const componentHistory: Map<string, RenderShieldDiff[]> = new Map();
const MAX_HISTORY = 10;
const MAX_COMPONENTS = 100; // Prevent unbounded growth: limit to 100 unique components

/**
 * Clean up old component history entries to prevent memory leaks.
 * Removes entries for components that haven't reported in a while.
 * Called periodically to keep memory bounded.
 */
function cleanupHistory() {
  if (isProd()) return;
  
  // If we exceed MAX_COMPONENTS, remove oldest entries (FIFO)
  // In practice, this is unlikely in dev mode, but provides safety
  if (componentHistory.size > MAX_COMPONENTS) {
    const entries = Array.from(componentHistory.entries());
    const toRemove = entries.slice(0, componentHistory.size - MAX_COMPONENTS);
    for (const [key] of toRemove) {
      componentHistory.delete(key);
    }
  }
}

/**
 * Report function - dev-only diagnostics.
 * 
 * Production safety: Early return gates execution, but does not guarantee tree-shaking.
 * Tree-shaking depends on bundler's ability to statically evaluate process.env.NODE_ENV.
 * If bundler doesn't replace process.env.NODE_ENV, debug code exists in bundle but doesn't execute.
 * This is gating, not elimination. Both are safe; elimination is probabilistic.
 */
export function report(diff: RenderShieldDiff) {
  if (isProd()) return;

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
    // Track history for recommendations (dev-only)
    trackHistory(diff);
    
    // Generate recommendations based on pattern analysis
    const recommendations = generateRecommendations(diff);
    const diffWithRecommendations: RenderShieldDiff = {
      ...diff,
      recommendations: recommendations.length > 0 ? recommendations : undefined,
    };
    
    renderLog(diffWithRecommendations);
  }
  pendingReports.clear();
  isBatching = false;
}

/**
 * Track component history for pattern analysis.
 * Maintains last MAX_HISTORY reports per component (FIFO).
 * 
 * Component identity: Uses diff.componentName, which should be stable:
 * - HOC: Component.displayName || Component.name (stable, set at HOC creation)
 * - Hook: opts.componentName (user-provided, should be stable)
 * - Fallback: "Anonymous" (multiple unnamed components share history - acceptable for dev)
 * 
 * Memory bounded: MAX_COMPONENTS limit + periodic cleanup prevents unbounded growth.
 */
function trackHistory(diff: RenderShieldDiff) {
  if (isProd()) return;
  
  const componentKey = diff.componentName ?? "Anonymous";
  const history = componentHistory.get(componentKey) ?? [];
  
  // Add current diff
  history.push(diff);
  
  // Keep only last MAX_HISTORY
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  
  componentHistory.set(componentKey, history);
  
  // Periodic cleanup to prevent memory leaks
  // Clean up every 50 reports to avoid overhead
  if (componentHistory.size % 50 === 0) {
    cleanupHistory();
  }
}

/**
 * Generate recommendations based on pattern analysis.
 * Low-noise: only emit when patterns are detected (>= 3 occurrences).
 * Caps "Consider watching:" to top 3 most repeated keys.
 */
function generateRecommendations(diff: RenderShieldDiff): string[] {
  if (isProd()) return [];
  
  const recommendations: string[] = [];
  const componentKey = diff.componentName ?? "Anonymous";
  const history = componentHistory.get(componentKey) ?? [];
  
  // Need at least some history to generate recommendations
  if (history.length < 3) return [];
  
  // Count key occurrences across history
  const keyCounts = new Map<string, number>();
  const watchedSet = new Set(diff.watchedStable.concat(diff.watchedChanged));
  
  for (const h of history) {
    for (const key of h.changedKeys) {
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
    }
  }
  
  // Find keys that appear >= 3 times and are not watched
  const repeatedNonWatched: Array<[string, number]> = [];
  for (const [key, count] of keyCounts.entries()) {
    if (count >= 3 && !watchedSet.has(key)) {
      repeatedNonWatched.push([key, count]);
    }
  }
  
  // Sort by count (descending) and take top 3
  repeatedNonWatched.sort((a, b) => b[1] - a[1]);
  const topRepeated = repeatedNonWatched.slice(0, 3).map(([key]) => key);
  
  if (topRepeated.length > 0) {
    recommendations.push(`Consider watching: ${topRepeated.join(", ")}`);
  }
  
  // Contract drift detection
  if (diff.contract && diff.contract.watch.length > 0) {
    const contractWatchSet = new Set(diff.contract.watch);
    const contractMismatch = diff.changedKeys.filter(
      (key) => !contractWatchSet.has(key)
    );
    
    if (contractMismatch.length > 0) {
      recommendations.push(
        `Contract specifies [${diff.contract.watch.join(", ")}] but [${contractMismatch.join(", ")}] changed`
      );
    }
  }
  
  return recommendations;
}

function renderLog(diff: RenderShieldDiff) {
  const name = diff.componentName ? `<${diff.componentName}>` : "<Component>";
  const title = `[RenderShield] ${name}`;

  // Use try-finally to ensure console.groupEnd() is always called
  // Prevents unclosed groups in StrictMode or if errors occur
  try {
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

    // Staleness risk warning (dev-only, when shielding occurs with non-watched changed keys)
    if (diff.shielded && diff.changedKeys.length > 0) {
      const watchedSet = new Set(
        diff.watchedStable.concat(diff.watchedChanged)
      );
      const nonWatchedChanged = diff.changedKeys.filter(
        (key) => !watchedSet.has(key)
      );

      if (nonWatchedChanged.length > 0) {
        console.warn(
          `⚠️ Staleness Risk: Shielding occurred but non-watched keys changed: [${nonWatchedChanged.join(", ")}]. ` +
            `The returned value may contain stale data for these keys. ` +
            `Only read watched paths from the returned value, or use the original props for non-watched keys.`
        );
      }
    }

    // Hook vs HOC mental model clarification (when hook shields but component still runs)
    if (diff.shielded && !isNaN(diff.renderCount) && diff.renderCount > 1) {
      // This is a hook (has render count), not HOC (which has NaN render count)
      // Remind that hook doesn't prevent component execution
      // Only show once per component to avoid noise
      const warningKey = `hook-warning-${diff.componentName ?? "anonymous"}`;
      if (typeof window !== "undefined" && !(window as any)[warningKey]) {
        (window as any)[warningKey] = true;
        console.info(
          `ℹ️ Note: useRenderShield returned a previous value (shielding), but the component still executed (render #${diff.renderCount}). ` +
            `The hook stabilizes the value for downstream consumers but does NOT prevent component rerenders. ` +
            `To prevent component execution, use withRenderShield (HOC) instead.`
        );
      }
    }

    // Contract compliance (only if contract exists)
    if (diff.contract) {
      const contractWatchSet = new Set(diff.contract.watch);
      const contractMismatch = diff.changedKeys.filter(
        (key) => !contractWatchSet.has(key)
      );
      const contractCompliant = contractMismatch.length === 0;
      
      console.log(
        `Contract: ${contractCompliant ? "✓ Compliant" : "⚠ Drift"} (specifies: [${diff.contract.watch.join(", ")}])`
      );
      
      if (diff.contract.description) {
        console.log(`Contract description: ${diff.contract.description}`);
      }
    }

    // Recommendations (only if present)
    if (diff.recommendations && diff.recommendations.length > 0) {
      try {
        console.group("💡 Recommendations");
        for (const rec of diff.recommendations) {
          console.log(`  • ${rec}`);
        }
        console.groupEnd();
      } catch (e) {
        // Fallback if nested group fails
        console.log("💡 Recommendations:");
        for (const rec of diff.recommendations) {
          console.log(`  • ${rec}`);
        }
      }
    }

    // Summary statistics
    const summary = [
      `Shielded: ${diff.shielded ? "Yes" : "No"}`,
      `Changed keys: ${diff.changedKeys.length}`,
      `Stable keys: ${diff.stableKeys.length}`,
      diff.recommendations && diff.recommendations.length > 0
        ? `Recommendations: ${diff.recommendations.length}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    console.log(`Summary: ${summary}`);
  } finally {
    // Always close the main group, even if errors occur
    console.groupEnd();
  }

  // v0.3.0 visual HUD
  if (diff.shielded && diff.visual === true) {
    triggerToast(name, diff.severity);
  }
}

function isProd(): boolean {
  try {
    return (
      typeof process !== "undefined" &&
      !!process.env &&
      process.env.NODE_ENV === "production"
    );
  } catch {
    return false;
  }
}

/**
 * v0.3.0 toast engine
 * - SSR-safe
 * - single shared node
 * - allows user CSS overrides via className
 * - self-destructs
 */
function triggerToast(componentLabel: string, severity: string) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const ID = "render-shield-toast";
  const CLASS = "render-shield-toast";

  // Replace existing toast (single shared node).
  const existing = document.getElementById(ID);
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = ID;
  toast.className = CLASS;

  // Default styling (user can override via .render-shield-toast in their own CSS)
  Object.assign(toast.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    background: "rgba(12, 16, 22, 0.92)",
    color: "white",
    padding: "12px 14px",
    borderRadius: "12px",
    boxShadow: "0 14px 38px rgba(0,0,0,0.38)",
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
    fontSize: "13px",
    lineHeight: "1.25",
    fontWeight: "650",
    zIndex: "2147483647",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    border: "1px solid rgba(255,255,255,0.12)",
    backdropFilter: "blur(8px)",
    transform: "translateY(12px)",
    opacity: "0",
    transition: "transform 180ms ease, opacity 180ms ease",
    pointerEvents: "none",
    maxWidth: "340px",
  } as CSSStyleDeclaration);

  const safeComponent = escapeHtml(componentLabel);
  const safeSeverity = escapeHtml(severity);

  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px;">
      <span aria-hidden="true" style="font-size:16px; line-height:1;">🛡️</span>
      <div style="display:flex; flex-direction:column; gap:2px;">
        <div style="opacity:0.98">
          <span style="color: #35d07f; font-weight: 800;">${safeComponent}</span> shielded
        </div>
        <div style="font-size:11px; font-weight:600; opacity:0.78">
          ${safeSeverity}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
  });

  // Auto cleanup
  window.setTimeout(() => {
    toast.style.transform = "translateY(8px)";
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 220);
  }, 2000);
}

function escapeHtml(input: string): string {
  return input
    .split("&").join("&amp;")
    .split("<").join("&lt;")
    .split(">").join("&gt;")
    .split('"').join("&quot;")
    .split("'").join("&#039;");
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
