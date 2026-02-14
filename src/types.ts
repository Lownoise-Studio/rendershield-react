// src/types.ts

export type RenderShieldSeverity =
  | "Stable"
  | "Changed (non-UI key)"
  | "Changed (watched key)"
  | "Custom compare triggered";

/** @deprecated Use RenderShieldSeverity. Kept for backward compatibility. */
export type DiffSeverity = RenderShieldSeverity;

export type RenderShieldDiff = {
  componentName?: string;
  shielded: boolean;
  renderCount: number;
  changedKeys: string[];
  stableKeys: string[];
  watchedChanged: string[];
  watchedStable: string[];
  severity: RenderShieldSeverity;

  /**
   * v0.3.0
   * Enables the dev HUD toast for this report event.
   * Set by hook/HOC from RenderShieldOptions.visual.
   */
  visual?: boolean;
};

export type RenderShieldOptions<T> = {
  watch?: string[];
  debug?: boolean;

  /**
   * v0.3.0
   * When true, render shielded events will show a small dev HUD toast.
   */
  visual?: boolean;

  customCompare?: (prev: T, next: T) => boolean;

  /**
   * Optional explicit name for hook-based usage (HOC derives name automatically).
   */
  componentName?: string;
};
