export { useRenderShield } from "./hook";
export { withRenderShield } from "./hoc";

// Alias for clarity: diagnostics-only mode
export { useRenderShield as useRenderShieldReport } from "./hook";

export type { RenderShieldOptions, RenderShieldDiff, DiffSeverity } from "./types";
export { getShallowDiff } from "./shallowCompare";
export { compareWatchedPaths, getAtPath, deepEqual } from "./pathCompare";
