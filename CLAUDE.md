# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server enabling AI assistants to interact with Anki via AnkiConnect. Built with NestJS and `@rekog/mcp-nest`.

- **Package**: `@ankimcp/anki-mcp-server` (npm)
- **License**: MIT
- **Status**: Beta (0.x.x) - breaking changes allowed

## Quick Reference

```bash
# Build & Run
npm run build                    # Build → dist/ (both entry points)
npm run start:dev:stdio          # STDIO mode with watch
npm run start:dev:http           # HTTP mode with watch

# Testing
npm test                         # All tests
npm test -- path/to/file.spec.ts # Single test file
npm run test:tools               # Tool unit tests only
npm run test:workflows           # Multi-tool workflow scenarios (mocked)
npm run test:cov                 # With coverage (70% threshold)
npm run e2e:full:local           # One-shot E2E: up → test → down

# Quality
npm run lint && npm run type-check   # Pre-push checks (also runs via Husky)

# Debugging
npm run inspector:stdio          # MCP Inspector UI for testing tools
npm run inspector:stdio:debug    # With debugger on port 9229
npm run inspector:http           # Inspector against HTTP transport
```

## Architecture

### Entry Points

Two entry points compiled in a single build:

| Mode | Entry | Use Case | Logging |
|------|-------|----------|---------|
| STDIO | `dist/main-stdio.js` | Claude Desktop, MCP clients | stderr |
| HTTP | `dist/main-http.js` | Web-based AI (ChatGPT, claude.ai) | stdout |

### Core Files

```
src/
├── main-stdio.ts            # STDIO bootstrap: NestFactory.createApplicationContext()
├── main-http.ts             # HTTP bootstrap: NestFactory.create() + guards
├── app.module.ts            # Root module with forStdio()/forHttp() factories
├── bootstrap.ts             # Shared logger setup (pino → NestJS LoggerService)
├── cli.ts                   # Commander CLI (--port, --host, --anki-connect, --ngrok, --read-only)
├── anki-config.service.ts   # IAnkiConfig implementation (reads env vars via ConfigService)
├── http/guards/             # Origin validation guard (DNS rebinding protection)
├── services/ngrok.service.ts # Ngrok tunnel management (spawns ngrok, polls for URL)
└── mcp/
    ├── clients/anki-connect.client.ts  # HTTP client using ky (retries, error handling, read-only guard)
    ├── config/anki-config.interface.ts # ANKI_CONFIG injection token + IAnkiConfig interface
    ├── types/anki.types.ts             # Shared Anki types (cards, notes, ratings)
    ├── utils/                          # Shared utilities (anki.utils, markdown.utils, stats.utils)
    ├── primitives/essential/           # Core tools, prompts, resources
    └── primitives/gui/                 # GUI-specific tools (require user approval)
```

### Module System

```
AppModule.forStdio()/forHttp()
  → McpModule.forRoot()           # STDIO or STREAMABLE_HTTP transport
  → McpPrimitivesAnkiEssentialModule.forRoot()
  → McpPrimitivesAnkiGuiModule.forRoot()
```

All tools/prompts/resources are providers auto-discovered by `@rekog/mcp-nest`. MCP-Nest 1.9.0+ requires tools to also be listed in `AppModule.providers` (see `ESSENTIAL_MCP_TOOLS` and `GUI_MCP_TOOLS` arrays).

### Key Patterns

**Tool response format**: Success paths return raw objects matching the tool's `outputSchema`. The mcp-nest handler validates and wraps them automatically. Error paths use `createErrorResponse(error, context)` from `anki.utils.ts` which returns `CallToolResult` with `isError: true` and bypasses outputSchema validation.

**Action tool pattern**: Complex tools like `deckActions`, `tagActions`, `mediaActions` use a dispatch pattern — a single `@Tool` with an `action` discriminant that switches to handler functions in an `actions/` subdirectory. Each action is a pure function taking `(params, ankiClient)`.

**Read-only mode**: `AnkiConnectClient` enforces read-only mode by checking actions against a `WRITE_ACTIONS` set before sending requests. Throws `ReadOnlyModeError`. Review/scheduling operations are always allowed.

**Config system**: Two injection tokens:
- `APP_CONFIG` — validated `AppConfig` object (Zod schema in `src/config/config.schema.ts`). Provided as `useValue` after parsing env + CLI overrides.
- `ANKI_CONFIG` — AnkiConnect-specific config interface. Provided via `useClass: AppConfigService` in each module's `forRoot()`. Modules can swap the config provider for testing.

**Environment Configuration**: All `process.env.*` reads go through `buildConfigInput()` in `src/config/config.factory.ts`. CLI args override env vars in memory (no `process.env` mutation). Services inject `AppConfigService` for type-safe access.

### Upstream AnkiConnect Quirks

These are upstream behaviors that shape tool design — surface them in tool descriptions so the AI can avoid them:

- **`updateNoteFields` silently fails** if the target note is open in Anki's Browse window. The request returns 200 but fields don't persist. Warn users in the tool description.
- **Model CSS is per-note-type, not per-note.** Use `modelStyling` to fetch CSS for a model; `notesInfo` tells you which model each note uses. `updateNoteFields` should preserve inline styles.
- **`sync` relies on the desktop app being logged into AnkiWeb.** There's no API path to authenticate — surface a helpful error hint.
- **`deleteNotes` is irreversible and cascades to all cards** of the note. The tool requires explicit `confirmDeletion: true`.

### Path Aliases

- `@/*` → `src/*`
- `@test/*` → `test/*`

### Key Dependencies

- **Zod v4** (`zod@^4.x`) — NOT v3. Zod 4 has different APIs (e.g., `z.interface()`, changed error handling). Don't use v3 patterns.
- **`@modelcontextprotocol/sdk`** — Pinned to exact version (`1.29.0`). Don't bump without testing MCP protocol compatibility.
- **TypeScript** — `strict: true`, `module: "nodenext"`, target `ES2023`. Path aliases (`@/`, `@test/`) handle most imports.
- **ESLint** — Flat config (`eslint.config.mjs`), not legacy `.eslintrc`.

## Adding New Tools

### Essential Tools (general Anki operations)

1. Create `src/mcp/primitives/essential/tools/your-tool.tool.ts`
2. Export from `src/mcp/primitives/essential/index.ts`
3. Add to `ESSENTIAL_MCP_TOOLS` array
4. **Update `manifest.json`** tools array
5. Create test: `src/mcp/primitives/essential/tools/__tests__/your-tool.tool.spec.ts`

**Note**: `ESSENTIAL_MCP_TOOLS` contains tools, prompts, and resources that MCP-Nest discovers. The separate `ESSENTIAL_MCP_PRIMITIVES` array adds infrastructure like `AnkiConnectClient`.

For multi-action tools, use the action tool pattern: create a directory with `index.ts`, `yourTool.tool.ts`, and `actions/*.action.ts` files. See `deckActions/` for reference.

For tools with complex output schemas, extract Zod types into a `*.types.ts` file alongside the tool (see `collection-stats/collection-stats.types.ts` and `review-stats/review-stats.types.ts`).

### GUI Tools (interface operations)

Same as above but in `src/mcp/primitives/gui/`. Must include dual warnings:
- "IMPORTANT: Only use when user explicitly requests..."
- "This tool is for note editing/creation workflows, NOT for review sessions"

### Tool Pattern

```typescript
// 1. Zod schema for input validation
// 2. @Injectable() class with AnkiConnectClient injected
// 3. @Tool({ name, description, parameters, outputSchema, annotations }) decorator
// 4. execute() method calling AnkiConnectClient.invoke()
// 5. Success: return raw object matching outputSchema (handler wraps it automatically)
// 6. Error: return createErrorResponse() (bypasses outputSchema validation)
```

**outputSchema**: All tools define a Zod `outputSchema` in the `@Tool` decorator. The mcp-nest handler validates success returns via `safeParse()` and wraps them as `structuredContent`. Error returns via `createErrorResponse()` have a `content` array and bypass schema validation.

**annotations**: All tools declare `readOnlyHint`, `destructiveHint`, and optionally `idempotentHint` in the `@Tool` decorator.

See `src/mcp/primitives/essential/tools/sync.tool.ts` for minimal example.

## Testing

### Test Organization

Three distinct tiers — pick the right one for the change:

- **Unit** — `src/**/__tests__/*.spec.ts`, colocated with source. Mock `AnkiConnectClient`. Fast, run on every push.
- **Workflows** — `test/workflows/*.spec.ts` (e.g., `note-management.spec.ts`, `review-session.spec.ts`). Multi-tool scenarios still against a mocked client. Use for cross-tool invariants.
- **E2E** — `test/e2e/*.e2e-spec.ts`. Hits a real Anki + AnkiConnect running in Docker. Covers both STDIO and HTTP transports.

Shared test infra:

- `src/test-fixtures/test-helpers.ts` — `parseToolResult()`, `createMockContext()`
- `src/test-fixtures/mock-data.ts` — `mockNotes`, `mockDecks`, `mockCards`, `mockErrors`

```bash
# Single test file
npm test -- src/mcp/primitives/essential/tools/__tests__/sync.tool.spec.ts
```

**ESM packages gotcha**: `ky`, `unified`, `remark-parse`, and other ESM-only deps require `transformIgnorePatterns` in jest config (see `package.json`). If adding new ESM deps, add them to the pattern.

### E2E Tests (requires Docker)

```bash
npm run e2e:up              # Start Anki + AnkiConnect containers
npm run e2e:test            # Run all E2E tests
npm run e2e:test:stdio      # STDIO transport only
npm run e2e:test:http       # HTTP transport only
npm run e2e:down            # Stop containers
npm run e2e:full:local      # All-in-one: up → test → down
```

## Git Hooks (Husky)

- **pre-commit**: Runs `npm run sync-version` to sync `package.json` version → `manifest.json`, then stages `manifest.json`
- **pre-push**: Runs lint, type-check, and full test suite (all must pass)

## Release Process

1. Update version in `package.json` (single source of truth — pre-commit hook syncs to `manifest.json`)
2. **Add new tools to `manifest.json` tools array**
3. Commit and tag: `git tag -a v0.x.0 -m "message" && git push origin v0.x.0`
4. GitHub Actions handles: version sync, build, MCPB bundle, npm publish, GitHub release

**npm publishing** uses OIDC Trusted Publishing (no `NPM_TOKEN` needed). The `--provenance` flag triggers OIDC auth and generates cryptographic attestations. Configured in `npm-publish.yml` and `npm-publish-legacy.yml`.

**MCP Registry publishing** is handled by `mcp-registry-publish.yml`, which publishes `server.json` to the official MCP registry on tagged releases (wired in v0.18.4).

**Don't run `npm run mcpb:bundle` manually** - CI handles it.

## MCPB Bundle Notes

Bundle uses STDIO entry point. Key gotchas:

- User config keys in `manifest.json` must be **snake_case** (e.g., `anki_connect_url`)
- Peer dependencies of `@rekog/mcp-nest` must stay as direct deps (JWT, passport modules)
- `mcpb clean` removes devDeps to optimize size (47MB → ~10MB)
- Use **npm** (not pnpm) - `mcpb clean` doesn't work with pnpm's node_modules

## Environment

Node.js requirement: `>=20.19.0 <21.0.0 || >=22.12.0` (Node 21 not supported — `require(esm)` was never backported)

Key environment variables (all have defaults):
- `ANKI_CONNECT_URL` — AnkiConnect URL (default: `http://localhost:8765`)
- `ANKI_CONNECT_API_KEY` — Optional AnkiConnect API key
- `LOG_LEVEL` — `debug|info|warn|error` (default: `info`)
- `READ_ONLY` — `true|1` to block write operations (enforced in `AnkiConnectClient`)

### Media Security

`mediaActions` and `updateNoteFields` audio/picture/video fields validate inputs against prompt-injection and SSRF attacks:

- **File paths** — MIME-type allowlist (media only). Non-media files (SSH keys, creds, shell configs) are rejected.
  - `MEDIA_ALLOWED_TYPES` — extra MIME types (comma-separated)
  - `MEDIA_IMPORT_DIR` — restrict imports to a specific directory
- **URLs** — SSRF guard blocks loopback (127.x), RFC1918 (10/8, 172.16/12, 192.168/16), link-local (169.254.x), and non-HTTP(S) schemes.
  - `MEDIA_ALLOWED_HOSTS` — allowlist specific private hosts (e.g., `192.168.1.50,my-nas`)
- **Filenames** — path-traversal sanitization (`../`, absolute paths stripped).

Guards live in `src/mcp/primitives/essential/tools/mediaActions/`. E2E coverage in `test/e2e/media-security.stdio.e2e-spec.ts`. When touching these, always add a test — the recent path-traversal fix (commit f94cfb8) was reported externally.
