# Changelog

## [Unreleased]

- **New `setDeckLimits` tool** — sets daily limits (new cards per day and/or reviews per day) for an Anki deck via AnkiConnect's `getDeckConfig` and `saveDeckConfig`, and automatically refreshes the deck browser GUI.
- `review_stats` now documents that reviews of cards deleted afterwards are not counted (AnkiConnect only exposes review logs of existing cards), so totals can be lower than Anki's own statistics.

## [0.26.0] - 2026-09

- **`review_stats`: fixed the study streak always reporting 0 west of UTC; days are now local days.** `calculateStreak` compared a date parsed as UTC midnight against a local midnight, so for any host timezone behind UTC the first comparison failed and the streak collapsed to 0. It was invisible in UTC and east of it, which is why CI never caught it. Day boundaries throughout the tool now follow the server's local timezone instead of UTC, matching how Anki defines a day: `reviews_by_day` files an evening review under the day it was done (previously a 9pm review in UTC-7 was reported as tomorrow, and a 1am review in UTC+3 as yesterday), `end_date` defaults to the local calendar day, and the `start_date`/`end_date` window spans local days. This assumes the server shares Anki's timezone (true for the default localhost setup); Anki's configurable "next day starts at" hour is not honoured yet, as AnkiConnect exposes no action for it. A timezone-pinned regression spec (`review-stats.timezone.spec.ts`, using a custom Jest environment in `test/jest-environments/`) now runs as part of the normal suite.
- **New `suspend` / `unsuspend` / `areSuspended` tools** — suspend hides cards from review without touching note content, scheduling history or deck placement; unsuspend returns them. `areSuspended` reports state without changing anything. Card IDs (not note IDs), max 500 per call, duplicates deduped before mutating.
- `suspend`/`unsuspend` validate every card ID before mutating: AnkiConnect handles nonexistent IDs inconsistently (usually an error, sometimes a silent skip depending on input order), so IDs are checked up front via `areSuspended`, which reports a missing card as `null`, and nothing is changed if any is missing. Shared logic lives in `src/mcp/utils/card-suspension.utils.ts`.
- Suspension state is read back after the mutation, so the response reports what Anki actually did rather than what was requested. When the read-back can't be trusted (an error, or a reply that isn't array-shaped, doesn't match the input count, or contains an entry that is neither a boolean nor `null`), `cards` comes back empty, `cardsChanged` is omitted and `message` says so explicitly — the mutation itself was still applied, so the caller should not retry.
- Dependency bumps: `@nestjs/{common,core,microservices,platform-express}` 12.0.1 → 12.0.3, `@rekog/mcp-nest` 2.0.5 → 2.0.6, `zod` 4.5.4 → 4.6.5; dev deps `@modelcontextprotocol/inspector` 2.6.0 → 2.7.0, `@nestjs/{cli,schematics,testing}` → 12.0.3, `jest` 30.5.1 → 30.5.2, `prettier` 3.9.6 → 3.9.8, `@types/node` 26.5.0 → 26.6.1.

## [0.25.1] - 2026-09

- `notesInfo` no longer requires `mod` in the AnkiConnect response, so older add-on builds work (fixes #66).

## [0.25.0] - 2026-09

- **NestJS 11 → 12** (`@nestjs/{common,core,microservices,platform-express,config,cli,schematics,testing}`), matching upstream's ESM-only release. No user-facing behavior change and the runtime Node floor is unchanged (`>=22.12.0`) — Node's `require(esm)` interop lets the app boot normally. Development/testing now needs Node `>=24.9`: Jest's own module loader needs that version to `require()` Nest 12's ESM packages. Jest also needs the `--experimental-vm-modules` flag for that loader path, which is now baked into the npm test scripts via `NODE_OPTIONS`, so contributors don't need to set it manually.

- **BREAKING: `get_due_cards` / `get_cards` no longer return `back` by default** (fixes #62). Answers were included in every response, so they entered the model's context before the user had a chance to self-test during a review session — defeating the point of spaced repetition. Both tools now take an `include_answer` parameter (default `false`); pass `include_answer: true` to get answers back, e.g. for content analysis/editing workflows that are not live review. During review, keep it `false` and reveal answers per-card via `present_card` with `show_answer: true`.

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
