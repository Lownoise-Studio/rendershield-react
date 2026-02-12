export type RenderShieldOptions<T> = {
    watch?: string[]; // nested paths to compare (targeted deep compare ONLY for these)
    debug?: boolean; // dev-only console reporting
    customCompare?: (prev: T, next: T) => boolean; // user-defined equality
  };
  
  export type DiffSeverity =
    | "Stable"
    | "Changed (non-UI key)"
    | "Changed (watched key)"
    | "Custom compare triggered";
  
  export type RenderShieldDiff = {
    componentName?: string;
    shielded: boolean;
    renderCount: number;
    changedKeys: string[];
    stableKeys: string[];
    watchedChanged: string[];
    watchedStable: string[];
    severity: DiffSeverity;
  };
  