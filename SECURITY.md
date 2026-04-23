# Security Policy

## Supported Versions

This project is in public beta (`0.x.y`). Only the **latest minor release** receives security fixes. Older minors are not patched; please upgrade before reporting.

## Reporting a Vulnerability

**Please do not open public GitHub issues for suspected vulnerabilities.**

- **Preferred:** GitHub Private Vulnerability Reporting — <https://github.com/ankimcp/anki-mcp-server/security/advisories/new>
- **Fallback:** email <support@ankimcp.ai>

### What to Include

- Affected version(s) (npm package and/or `.mcpb` bundle)
- Reproduction steps or proof of concept
- Impact assessment (what an attacker can achieve)
- Any known mitigations or workarounds

## Response Targets

- **Acknowledgment:** within 5 business days
- **Triage (severity + initial plan):** within 14 business days
- **Disclosure:** coordinated; a CVE will be requested when warranted; reporters are credited in the advisory and release notes unless they opt out

## Scope

**In scope**

- Source code in this repository
- Published npm package `@ankimcp/anki-mcp-server`
- Published `.mcpb` bundle attached to GitHub releases
- Runtime dependencies declared in `package.json` under `dependencies`

**Out of scope**

- The AnkiConnect add-on (<https://github.com/FooSoft/anki-connect>)
- Anki core (<https://github.com/ankitects/anki>)
- Third-party MCP clients (Claude Desktop, ChatGPT, etc.)
- Issues requiring a pre-compromised host or Anki profile

## Past Advisories

Previously disclosed issues are visible in `git log` and in any published GitHub Security Advisories for this repository. Notably, the media path traversal and SSRF fix (commit `f94cfb8`, released in 0.15.x) was reported and coordinated with Hideaki Takahashi — see the README acknowledgement.
