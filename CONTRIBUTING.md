Contributing to RenderShield React
Thank you for your interest in contributing.
RenderShield React is intentionally small, explicit, and conservative by design. Before submitting changes, please read this carefully.
Design Principles
RenderShield React:
Does not mutate props
Does not rewrite state
Does not patch React internals
Does not guarantee performance gains
Prefers explicit diagnostics over hidden magic
If a proposed change violates these principles, it will not be accepted.
Types of Contributions Welcome
Bug fixes
Improvements to diagnostics clarity
Performance-safe internal refinements
Better documentation
Repro cases demonstrating unexpected behavior
Not In Scope
Automatic deep equality by default
Compiler transformations
Runtime patching of React
Global behavior modification
“Auto optimize everything” features
RenderShield is a developer instrument — not an optimization engine.
Development Setup
Clone the repository
Install dependencies
Run the demo or example app
Ensure changes do not alter the public API without discussion
All changes should be predictable and minimal.
Pull Request Guidelines
Keep PRs focused and small
Explain why the change aligns with project philosophy
Include reproduction steps for bug fixes
Avoid introducing new external dependencies unless absolutely necessary
Code Style
Clear naming
No hidden behavior
Explicit comparisons
No silent side effects
Philosophy
RenderShield React exists to make render behavior observable and understandable.
If your change makes the system more explicit, transparent, or educational, you're likely aligned with the project.
