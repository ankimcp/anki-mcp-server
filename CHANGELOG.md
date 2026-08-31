# Changelog

## [Unreleased]

- **New `forgetCards` tool** — resets cards to the new queue, discarding interval, due date and ease factor. Previously the only way to push a card back into rotation was `rate_card` with a rating of 1, which records a real review, counts as a lapse and drops the card's ease factor — corrupting both future scheduling and review statistics. The response reports each card's prior state (`previousState`, `previousIntervalDays`, `reps`, `lapses`) so callers can show what was given up. The review log is preserved; note content, tags and deck placement are untouched.
- **New `setDueDate` tool** — reschedules cards to become due in N days without recording a review. Accepts Anki's spec format: `"0"` (today), `"5"`, `"3-7"` (a random day in range, to spread a batch out) and a trailing `!` (`"1!"`) to also overwrite the interval. Scheduling is read back after the change, so ranges report the day each card actually landed on. When the read-back can't be trusted (an error, a response that isn't array-shaped or doesn't match the input count, or an entry for a card deleted between the mutation and the read-back), `scheduled` comes back empty and `message` says so explicitly — the reschedule itself was still applied, so the caller should not retry.
- Both tools validate every card ID before mutating: AnkiConnect's `forgetCards` returns `null` and `setDueDate` returns `true` even for IDs that don't exist, so a typo would otherwise look like a successful reset. `forgetCards` validates via `cardsInfo` (it needs the prior scheduling state anyway); `setDueDate`'s pre-mutation existence check uses the lighter `cardsModTime`, which skips rendering question/answer/css per card — its post-mutation read-back still uses `cardsInfo`, since it needs the actual scheduling state. Shared validation lives in `src/mcp/utils/card-validation.utils.ts`.
- Hardened both tools' `cards` input: IDs must be positive integers, capped at 100 per call (matching `addNotes`), and duplicate IDs are deduped before validation and mutation so `cardsAffected` and per-card results reflect what Anki actually changed.

## [0.24.0] - 2026-08

- **Claude Desktop's Code tab works again** (fixes #53). Every tool call failed with `JSON Schema declares an unsupported dialect ("$schema": "http://json-schema.org/draft-07/schema#")`. [SEP-1613](https://modelcontextprotocol.io/seps/1613-establish-json-schema-2020-12-as-default-dialect-f) made 2020-12 the default dialect, but `@modelcontextprotocol/sdk` 1.x hardcodes draft-07 with no opt-out, and the upstream fixes for the 1.x line have not landed — so no configuration change here could resolve it. The server now uses the v2 SDK (`@modelcontextprotocol/{core,node,server}`), and all 96 tool schemas (48 input + 48 output) emit `https://json-schema.org/draft/2020-12/schema`. Regular Desktop chat was unaffected because it does not validate the dialect; only the Code tab does.
- **`@rekog/mcp-nest` 1.9.11 → 2.0.0**, a re-platform required by the SDK swap. `McpModule.forRoot()` is replaced by `McpStrategy`, a NestJS microservice transport strategy; tools/prompts/resources are now `@McpController()` classes whose handlers take `@Payload()`. No tool names, parameters, output schemas, or behavior changed — 48 tools in, 48 tools out.
- **Removed the `env://{name}` resource.** It returned any environment variable verbatim with no allowlist. Over tunnel or `--ngrok` that exposed the server process's environment to a remote client; as an MCPB extension it handed the model the `ANKI_CONNECT_API_KEY` that `manifest.json` injects. The `system://info` resource is unchanged and still reports `NODE_ENV`.
- **Tunnel: fixed cross-client response mix-up.** Responses were correlated by the client-chosen JSON-RPC id. Since MCP clients number ids per connection from 1, two callers on one tunnel — or one client reconnecting while a request was still in flight — collided: one caller received the other's response payload, the other hung the full 25s timeout, and a stale timer could evict a third request. The transport now renumbers requests internally and restores the caller's id on the way out.
- **Consistent server version across transports.** STDIO and HTTP advertised `serverInfo.version` as `1.0.0` while tunnel reported the real package version; MCP server identity now comes from validated config for all three.
- **Quieter startup.** Because mcp-nest v2 requires capability classes to be controllers, NestJS announced all 51 of them at startup in HTTP mode despite none exposing an HTTP route. Those `RoutesResolver` lines are now `debug`-level (still visible with `LOG_LEVEL=debug`); the `RouterExplorer` lines that record the actual MCP endpoint stay at `info`.
- **Smaller install.** `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt` and `jsonwebtoken` are gone — they were carried only as mcp-nest v1 peer dependencies and were never imported. v2 moves OAuth to a separate package.

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
