# Security Policy

## Supported Versions

RenderShield React follows semantic versioning.

The latest minor and patch releases of the current major version are supported for security updates. Older major versions may not receive security fixes.

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public issue.

Instead, email:
ccast83@gmail.com

Include:
- A clear description of the vulnerability
- Steps to reproduce
- Expected vs. actual behavior
- Any proof-of-concept code (if applicable)

You will receive an acknowledgment within 72 hours.

If the report is valid, we will:
1. Confirm the issue
2. Prepare a patch
3. Release a fixed version
4. Publicly disclose the issue with credit (if desired)

## Scope

RenderShield React does not perform network requests, data persistence, or runtime code evaluation.

Most risk surface would involve:
- Incorrect diagnostics
- Dev-only tooling leakage into production builds
- Unexpected mutation or side effects

We take reports seriously, even for small tools.
