# RenderShield React

Open-source React library for render-boundary diagnostics and explicit shielding.

RenderShield React analyzes and controls React render boundaries. It is a lightweight, local developer instrument: structured prop comparison, optional watched-path deep equality, and development-only diagnostics. It does not mutate props, rewrite state, patch React internals, or guarantee performance gains.

## Relationship to RenderShield Prerender

RenderShield React analyzes and controls React render boundaries. RenderShield Prerender is a separate crawler-oriented static-output CLI. Neither package depends on the other.

- **This package:** `@lownoise-studio/render-shield-react`
- **Not this package:** `@lownoise-studio/rendershield` (RenderShield Prerender)

## Installation

```bash
npm install @lownoise-studio/render-shield-react
```

**Peer dependency:** `react` `>=18`  
**Runtime dependencies:** none

## Quick start

```tsx
import { useRenderShield, withRenderShield } from "@lownoise-studio/render-shield-react";

// Hook: stabilize a value for downstream consumers (component still runs)
const shielded = useRenderShield(props, {
  watch: ["user.id"],
  debug: true,
});

// HOC: skip component execution when comparison says equal
const UserCard = withRenderShield(UserCardBase, {
  watch: ["user.id"],
  debug: true,
});
```

## HOC versus hook

| API | When comparison is equal | Component function |
| --- | --- | --- |
| `withRenderShield` | True render prevention via `React.memo` | Does **not** run |
| `useRenderShield` | Returns the previous reference | **Still runs** every render |

**Use the HOC** when you want to skip expensive component work.  
**Use the hook** when the component must run (effects, logging) but you want a stable value for children or other hooks.

Mental model:

- HOC → execution gate
- Hook → reference stabilizer
- Diagnostics → semantic analyst (dev-only)

These roles stay separate on purpose.

## Diagnostics-only mode

Inspect what shielding *would* do without changing behavior:

```tsx
useRenderShield(props, {
  watch: ["user.id"],
  debug: true,
  shield: false, // always return current value; still report when debug is on
});
```

Alias for clarity:

```tsx
import { useRenderShieldReport } from "@lownoise-studio/render-shield-react";

useRenderShieldReport(props, { debug: true, watch: ["user.id"], shield: false });
```

`withRenderShield` also honors `shield: false` (comparison and diagnostics still run; the wrapped component always re-renders).

## Watch paths and staleness contract

By default, comparison is **shallow** over top-level keys.

With `watch`, only those paths are deep-compared (no full-object deep equality):

```tsx
const shieldedProps = useRenderShield(props, {
  watch: ["user.id"],
});
```

If watched paths are stable, shielding may occur even when unrelated keys change.

**Staleness contract:** when the hook returns the previous value, only watched paths are guaranteed to match your comparison. Other keys on that object may be stale.

Safe patterns:

```tsx
const shieldedProps = useRenderShield(props, { watch: ["user.id"] });

// Safe: watched path
const userId = shieldedProps.user.id;

// Prefer original props for non-watched data
const userName = props.user.name;
```

In `debug` mode, shielding with non-watched changed keys emits a staleness risk warning.

## Component contracts

Document which paths matter for a component. Contracts feed compliance reporting and recommendations in debug output:

```tsx
useRenderShield(props, {
  watch: ["user.id"],
  debug: true,
  contract: {
    watch: ["user.id"],
    description: "Profile header only depends on user id",
  },
  componentName: "ProfileHeader",
});
```

## Custom comparator

Same contract as `React.memo`: return `true` when `prev` and `next` are considered equal (shield / prevent rerender).

```tsx
useRenderShield(props, {
  customCompare: (prev, next) => prev.id === next.id,
});
```

When provided, the custom comparator takes precedence. No extra heuristics are applied.

## Development-only diagnostics and HUD

Enable console diagnostics with `debug: true`:

- Shielded or not
- Render count (hook) or `NaN` (HOC comparator is not a render)
- Changed / stable keys
- Watched path results
- Severity classification
- Contract compliance (when `contract` is set)
- Low-noise pattern recommendations (after repeated patterns)
- Summary line

Diagnostics are gated when `process.env.NODE_ENV === "production"` (no console groups / HUD). That is **runtime gating**, not a guarantee of tree-shaking.

Optional visual HUD (`visual: true`) shows a short-lived toast when a shield event is reported. It is SSR-safe (no-ops without `document` / `window`) and only appears for shielded events in development.

## Machine-readable shape

There is no separate callback or network API. Diagnostics are console-oriented in development.

The public `RenderShieldDiff` type documents the diagnostic payload shape used internally (including optional `recommendations` and `contract`). Utilities such as `getShallowDiff` and `compareWatchedPaths` return plain objects you can use in your own tooling.

## Public API reference

From `@lownoise-studio/render-shield-react`:

| Export | Kind | Description |
| --- | --- | --- |
| `useRenderShield` | function | Reference-stabilizing hook |
| `useRenderShieldReport` | alias | Same as `useRenderShield` (diagnostics-oriented naming) |
| `withRenderShield` | function | Memo HOC with structured comparison |
| `getShallowDiff` | function | Top-level shallow diff helper |
| `compareWatchedPaths` | function | Deep equality on explicit paths |
| `getAtPath` | function | Dot / index path reader |
| `deepEqual` | function | Cycle-safe deep equality for watched values |
| `RenderShieldOptions` | type | Options bag |
| `RenderShieldDiff` | type | Diagnostic payload shape |
| `DiffSeverity` | type | Deprecated alias of severity union |

Package entry points: CJS (`dist/index.js`), ESM (`dist/index.mjs`), types (`dist/index.d.ts`).

## React and Node compatibility

| Environment | Support |
| --- | --- |
| React | Peer `>=18` (dev tests use React 19) |
| Node (CI / tooling) | 18, 20, 22 (Vitest 3 + Vite 5 + jsdom 24 pinned for Node 18) |
| Bundlers | Dual CJS + ESM |

## Limitations / what it is not

- Not a performance guarantee or automatic optimizer
- Not a React compiler or Babel plugin
- Does not mutate props or rewrite state
- Does not patch React internals
- Does not deep-compare entire objects by default
- Does not include hosted monitoring, retained history, dashboards, accounts, billing, telemetry, or managed alerts
- Does not perform prerendering, crawler delivery, Markdown/Worker generation, or RenderShield Prerender configuration

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md). Prefer GitHub private vulnerability reporting for this repository.

## License

[MIT](./LICENSE)
