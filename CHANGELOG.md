# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Documentation
- Rewrite README as accurate Markdown for the open-source RenderShield React product boundary.
- Clarify separation from RenderShield Prerender; no package coupling.
- Update CONTRIBUTING and SECURITY for current scripts and GitHub private vulnerability reporting.

### Added
- Packaging smoke test (`npm run test:packaging`) for pack → clean consumer → ESM/CJS/types, covering React 18 and React 19 peers.
- CI matrix for Node 18, 20, and 22, plus a Node 20 packaging-smoke job and production audit.
- Compatibility tests for package identity, public exports (source barrel), staleness contract, Strict Mode, SSR HUD safety, and production gating.

### Changed
- Prefer locally installed binaries in npm scripts (`tsup`, `vitest`, `tsc`).
- Expand package keywords for discoverability without changing package identity or version.
- Pin Vitest to v3, Vite to v5, and jsdom to v24 so CI can run on Node 18 (newer test-tooling stacks require Node 20+).

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
