# Changelog

## [0.23.0] - 2026-08

- **`deckStats` / `collection_stats`: honest count semantics** (fixes #50). `counts.new/learning/review` are AnkiConnect due-tree numbers — cards due _today_, capped by daily limits — not card-state totals, and `other` is an arithmetic remainder (mostly review cards not due today plus new cards beyond the daily limit), not "suspended/buried". All tool descriptions now say so; this corrects the `total == new + learning + review + other` framing introduced in 0.18.0, which is not guaranteed (`other` is clamped at 0 and filtered decks can break the identity).
- **New `states` block** with true card-state counts (new / learning / review / suspended / buried) computed from Anki searches — unaffected by due dates and daily limits. Per-deck on `deckStats`, collection-level on `collection_stats`. The five values are mutually exclusive and cover every card in scope (relearning cards count as `learning`). Costs 5 additional searches per call.
- **`listDecks` summary bugfix**: `new_cards`/`learning_cards`/`review_cards` no longer double-count subdecks (per-deck buckets are already rolled up over children; the summary now sums root decks only). Numbers shrink for collections with subdecks — they were inflated before. `total_cards` is unchanged (own-cards-only, correct as it was).
- **Deck-name escaping hardened** in `deckStats`, `collection_stats`, `get_cards`, `get_due_cards`: `_`, `*`, and `\` in deck names are now escaped as literals in generated Anki searches (previously `JLPT_N5` could silently match sibling decks; `Math\Physics` errored). `::` is untouched — nested deck names keep working.
- Stricter response validation on `findCards`/`getEaseFactors`/`getIntervals` payloads (throw instead of silently reporting 0).

## [0.18.0] - 2026-04

- `changeDeck` + `rate_card` now validate card IDs via `cardsInfo` before mutation (was silent-success on invalid IDs).
- `collection_stats` + `deckStats` add an `other` bucket so `total == new + learning + review + other` (captures suspended/buried cards); `per_deck` invariant: length always matches `total_decks`.
- `createDeck` distinguishes "created parent" vs "found existing parent" in message + adds `parentExisted` field.
- `get_due_cards` with `include_new: true` reports `"X cards (Y new, Z due)"` instead of mislabeling all as due.
- `addNote`: duplicate errors suggest `allowDuplicate: true`; response reports `duplicateCheckScope: "none"` when duplicates allowed.
- `addNotes` description narrowed — partial success covers duplicates only; validation errors reject the batch.
- Consolidated shared `AnkiDeckStatsResponse` into `src/mcp/types/anki.types.ts`.
- Fixed stale snake_case references to camelCase tool names across hints, prompts, and GUI tools.

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
