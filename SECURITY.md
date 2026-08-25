# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 1.0.x | Yes |
| 0.4.x | Security fixes on a best-effort basis |
| &lt; 0.4.0 | No |

Current published `latest` on npm is `1.0.0` (`@lownoise-studio/render-shield-react`).

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security reports.

Use [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability) for this repository:

1. Open https://github.com/Lownoise-Studio/rendershield-react/security/advisories/new  
2. Or use the repository **Security** tab → **Report a vulnerability**

Include:

- A clear description of the vulnerability
- Steps to reproduce
- Expected vs. actual behavior
- Any proof-of-concept (if applicable)

You should receive an acknowledgment within 72 hours.

If the report is valid, we will:

1. Confirm the issue
2. Prepare a patch
3. Release a fixed version
4. Disclose with credit if desired

**Manual repository setting:** ensure *Private vulnerability reporting* remains enabled under repository Settings → Code security.

## Scope

RenderShield React does not perform network requests, data persistence, accounts, billing, telemetry, or runtime code evaluation.

Likely risk surface:

- Incorrect diagnostics
- Dev-only tooling leakage into production builds
- Unexpected mutation or side effects

We take reports seriously, even for small tools.
