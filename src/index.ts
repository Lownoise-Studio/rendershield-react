export { useRenderShield } from "./hook";
export { withRenderShield } from "./hoc";

export type { RenderShieldOptions, RenderShieldDiff, DiffSeverity } from "./types";
export { getShallowDiff } from "./shallowCompare";
export { compareWatchedPaths, getAtPath, deepEqual } from "./pathCompare";
