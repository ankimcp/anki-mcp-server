# Changelog

## [0.17.0] - 2026-04
- Relicensed from AGPL-3.0-or-later to MIT
- Fixed manifest.json `author.url` to point at GitHub profile (required by Anthropic MCPB directory)

## [0.15.1] - 2026-04
- Optimize README hero image; fix npm upgrade crash in publish workflows (npm/cli#9151).

## [0.15.0] - 2026-03
- Media path-traversal and SSRF protection; E2E tests for media security guards; switch npm publishing to OIDC Trusted Publishing.

## [0.14.0] - 2026-02
- Improve MCP tool definitions for toolbench score; add bulk `addNotes` tool; fix deck stats resolution for child decks.

---

Release notes for `@ankimcp/anki-mcp-server` are maintained as
[GitHub Releases](https://github.com/ankimcp/anki-mcp-server/releases),
auto-generated from merged PRs per `release.yml`'s `generate_release_notes: true`.

For the changes in a given version, see the corresponding release on GitHub.

## Versioning

Semantic versioning. Currently in 0.x.x beta — breaking changes are
permitted per the versioning notes in `README.md`.
