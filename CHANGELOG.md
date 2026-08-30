# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.0.1] - 2026-08-29

### Fixed
- `deepEqual` no longer treats distinct Date / Map / Set / RegExp / opaque instances as equal via empty `Object.keys()`.
- `deepEqual` special-cases only exact built-in Array / Date / RegExp / Map / Set prototypes (subclasses prefer unequal).
- Cycle pair tracking returns unequal on mismatched left→right pairings (no stack overflow on differently shaped cyclic Maps).
- Contract path membership uses canonical path form (`items[0].id` ≡ `items.0.id`).
- `useRenderShieldReport` is diagnostics-only (`shield: false` always); it is no longer a bare alias of `useRenderShield`.
- Contract drift no longer flags changes to paths listed in `contract.watch`.
- `useRenderShield` no longer uses `null` as an uninitialized sentinel (legitimate `null` values enter normal compare/shield paths).

### Added
- R2 compatibility proof: packed-tarball ESM/CJS consumers, React 18.3.1 + React 19 matrix, TypeScript `skipLibCheck: false` consumer, SSR `renderToString` smoke (`scripts/smoke-consumers.mjs`).
- CI split: source unit job + React-version consumer matrix.
- `customCompare` and StrictMode regression coverage for HOC/hook/report APIs.

## [1.0.0] - 2026-08-23

### Fixed
- Hook debug reporting no longer repeats stale diagnostics when the value reference is unchanged.
- Recommendation history now accumulates across repeated evaluations even when console output is deduped.
- HOC now honors `shield: false` (diagnostics-only) and passes `visual` through to reports.
- Contract drift detection now compares top-level keys and watched paths instead of raw dot-path strings.

### Added
- GitHub Actions CI (typecheck, test, build).
- Unit tests for `report.ts` and `shallowCompare.ts`.
- `typecheck` and `test:run` npm scripts with `prepublishOnly` safety gate.

### Changed
- Library build no longer minifies output; source maps enabled for easier debugging.
- Replaced global `window` warning flags with module-level state in `report.ts`.

## [0.4.0]

- Pattern-based recommendations and component contract compliance reporting.
- Runtime warnings for staleness risk and hook vs HOC mental model clarification.

## [0.3.0]

- Dev HUD visual toast (`visual` option).
- Micro-task report batching for Strict Mode noise reduction.

## [0.2.0]

- `useRenderShield` hook with watch paths and `shield: false` diagnostics mode.

## [0.1.0]

- Initial release with `withRenderShield` HOC and shallow comparison.
