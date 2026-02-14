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
 */

type Pending = {
  key: string;
  diff: RenderShieldDiff;
};

let pendingReports: Map<string, Pending> = new Map();
let isBatching = false;

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
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
