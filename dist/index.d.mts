import React from 'react';

type RenderShieldOptions<T> = {
    watch?: string[];
    debug?: boolean;
    customCompare?: (prev: T, next: T) => boolean;
};
type DiffSeverity = "Stable" | "Changed (non-UI key)" | "Changed (watched key)" | "Custom compare triggered";
type RenderShieldDiff = {
    componentName?: string;
    shielded: boolean;
    renderCount: number;
    changedKeys: string[];
    stableKeys: string[];
    watchedChanged: string[];
    watchedStable: string[];
    severity: DiffSeverity;
};

declare function useRenderShield<T>(props: T, options?: RenderShieldOptions<T>): T;

declare function withRenderShield<P extends object>(Component: React.ComponentType<P>, options?: RenderShieldOptions<P>): React.MemoExoticComponent<React.ComponentType<P>>;

declare function getShallowDiff(prev: any, next: any): {
    equal: boolean;
    changedKeys: string[];
    stableKeys: string[];
};

declare function getAtPath(obj: any, path: string): any;
/**
 * Deep compare ONLY the values at watched paths.
 * This is intentionally targeted: no full-object deep recursion.
 */
declare function compareWatchedPaths<T>(prev: T, next: T, watch: string[]): {
    watchedChanged: string[];
    watchedStable: string[];
    watchedEqual: boolean;
};
/**
 * Minimal deep equality for watched values.
 * - Cycle-safe
 * - Handles primitives, arrays, plain objects
 * - Not intended for huge graphs (watch paths should stay small + intentional)
 */
declare function deepEqual(a: any, b: any, seen?: WeakMap<object, object>): boolean;

export { type DiffSeverity, type RenderShieldDiff, type RenderShieldOptions, compareWatchedPaths, deepEqual, getAtPath, getShallowDiff, useRenderShield, withRenderShield };
