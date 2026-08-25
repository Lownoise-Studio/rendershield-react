# Contributing to RenderShield React

Thank you for your interest in contributing.

RenderShield React is intentionally small, explicit, and conservative. Before submitting changes, please read this carefully.

## Design principles

RenderShield React:

- Does not mutate props
- Does not rewrite state
- Does not patch React internals
- Does not guarantee performance gains
- Prefers explicit diagnostics over hidden magic

If a proposed change violates these principles, it will not be accepted.

## Types of contributions welcome

- Bug fixes
- Improvements to diagnostics clarity
- Performance-safe internal refinements
- Better documentation
- Repro cases demonstrating unexpected behavior

## Not in scope

- Automatic deep equality by default
- Compiler transformations
- Runtime patching of React
- Global behavior modification
- “Auto optimize everything” features
- Hosted monitoring, dashboards, accounts, billing, or telemetry
- Coupling to RenderShield Prerender (`@lownoise-studio/rendershield`)

RenderShield React is a developer instrument — not an optimization engine.

## Development setup

```bash
git clone https://github.com/Lownoise-Studio/rendershield-react.git
cd rendershield-react
npm ci
npm run typecheck
npm run test:run
npm run build
npm run test:packaging
```

Useful scripts:

| Script | Purpose |
| --- | --- |
| `npm run test` | Vitest watch mode |
| `npm run test:run` | Single test run |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Dual CJS/ESM + DTS via tsup |
| `npm run test:packaging` | Pack + clean-consumer smoke test |
| `npm run dev` | tsup watch |

Optional: review `DEMO.md` for a manual verification checklist.

Do not alter the public API without discussion. Keep changes predictable and minimal.

## Pull request guidelines

- Keep PRs focused and small
- Explain why the change aligns with project philosophy
- Include reproduction steps for bug fixes
- Avoid new external runtime dependencies unless necessary

## Code style

- Clear naming
- No hidden behavior
- Explicit comparisons
- No silent side effects

## Philosophy

RenderShield React exists to make render behavior observable and understandable.

If your change makes the system more explicit, transparent, or educational, you are likely aligned with the project.
