# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server enabling AI assistants to interact with Anki via AnkiConnect. Built with NestJS and `@rekog/mcp-nest`.

- **Package**: `@ankimcp/anki-mcp-server` (npm)
- **License**: AGPL-3.0-or-later
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
npm run test:cov                 # With coverage (70% threshold)

# Quality
npm run lint && npm run type-check   # Pre-commit checks (also runs via Husky pre-push)

# Debugging
npm run inspector:stdio          # MCP Inspector UI for testing tools
npm run inspector:stdio:debug    # With debugger on port 9229
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

**Tool response format**: All tools return via `createSuccessResponse(data)` / `createErrorResponse(error, context)` from `anki.utils.ts`. These wrap results in MCP's `CallToolResult` format with JSON-stringified content.

**Action tool pattern**: Complex tools like `deckActions`, `tagActions`, `mediaActions` use a dispatch pattern — a single `@Tool` with an `action` discriminant that switches to handler functions in an `actions/` subdirectory. Each action is a pure function taking `(params, ankiClient)`.

**Read-only mode**: `AnkiConnectClient` enforces read-only mode by checking actions against a `WRITE_ACTIONS` set before sending requests. Throws `ReadOnlyModeError`. Review/scheduling operations are always allowed.

**Config system**: Two injection tokens:
- `ANKI_CONFIG` — Symbol token for AnkiConnect-specific config (IAnkiConfig interface). Provided via `useClass: AnkiConfigService` in each module's `forRoot()`. Modules can swap the config provider for testing.
- `ConfigModule` — NestJS config module reads environment variables. `AnkiConfigService` reads from it and sanitizes MCPB config values.

### Path Aliases

- `@/*` → `src/*`
- `@test/*` → `test/*`

## Adding New Tools

### Essential Tools (general Anki operations)

1. Create `src/mcp/primitives/essential/tools/your-tool.tool.ts`
2. Export from `src/mcp/primitives/essential/index.ts`
3. Add to `ESSENTIAL_MCP_TOOLS` array
4. **Update `manifest.json`** tools array
5. Create test: `src/mcp/primitives/essential/tools/__tests__/your-tool.tool.spec.ts`

**Note**: `ESSENTIAL_MCP_TOOLS` contains tools, prompts, and resources that MCP-Nest discovers. The separate `ESSENTIAL_MCP_PRIMITIVES` array adds infrastructure like `AnkiConnectClient`.

For multi-action tools, use the action tool pattern: create a directory with `index.ts`, `yourTool.tool.ts`, and `actions/*.action.ts` files. See `deckActions/` for reference.

### GUI Tools (interface operations)

Same as above but in `src/mcp/primitives/gui/`. Must include dual warnings:
- "IMPORTANT: Only use when user explicitly requests..."
- "This tool is for note editing/creation workflows, NOT for review sessions"

### Tool Pattern

```typescript
// 1. Zod schema for input validation
// 2. @Injectable() class with AnkiConnectClient injected
// 3. @Tool({ name, description, parameters }) decorator
// 4. execute() method calling AnkiConnectClient.invoke()
// 5. Return via createSuccessResponse() / createErrorResponse()
```

See `src/mcp/primitives/essential/tools/sync.tool.ts` for minimal example.

## Testing

```bash
npm test -- src/mcp/primitives/essential/tools/__tests__/sync.tool.spec.ts
```

- Mock `AnkiConnectClient` in unit tests (see existing tests)
- Use `test/workflows/*.spec.ts` for multi-tool scenarios
- Test helpers: `src/test-fixtures/test-helpers.ts` (`parseToolResult()`, `createMockContext()`)
- Mock data: `src/test-fixtures/mock-data.ts` (`mockNotes`, `mockDecks`, `mockCards`, `mockErrors`)
- **ESM packages gotcha**: `ky`, `unified`, `remark-parse`, and other ESM-only deps require `transformIgnorePatterns` in jest config (see `package.json`). If adding new ESM deps, add them to the pattern.

### E2E Tests (requires Docker)

```bash
npm run e2e:up              # Start Anki + AnkiConnect containers
npm run e2e:test            # Run E2E tests
npm run e2e:down            # Stop containers
npm run e2e:full:local      # All-in-one: start, test, cleanup
```

## Git Hooks (Husky)

- **pre-commit**: Runs `npm run sync-version` to sync `package.json` version → `manifest.json`, then stages `manifest.json`
- **pre-push**: Runs lint, type-check, and full test suite (all must pass)

## Release Process

1. Update version in `package.json` (single source of truth — pre-commit hook syncs to `manifest.json`)
2. **Add new tools to `manifest.json` tools array**
3. Commit and tag: `git tag -a v0.x.0 -m "message" && git push origin v0.x.0`
4. GitHub Actions handles: version sync, build, MCPB bundle, release

**Don't run `npm run mcpb:bundle` manually** - CI handles it.

## MCPB Bundle Notes

Bundle uses STDIO entry point. Key gotchas:

- User config keys in `manifest.json` must be **snake_case** (e.g., `anki_connect_url`)
- Peer dependencies of `@rekog/mcp-nest` must stay as direct deps (JWT, passport modules)
- `mcpb clean` removes devDeps to optimize size (47MB → ~10MB)
- Use **npm** (not pnpm) - `mcpb clean` doesn't work with pnpm's node_modules

## Planning Documents

Check `.claude-draft/` for implementation plans and analysis.

## Environment

Node.js requirement: `>=20.19.0 <21.0.0 || >=22.12.0` (Node 21 not supported — `require(esm)` was never backported)

Key environment variables (all have defaults):
- `ANKI_CONNECT_URL` — AnkiConnect URL (default: `http://localhost:8765`)
- `ANKI_CONNECT_API_KEY` — Optional AnkiConnect API key
- `LOG_LEVEL` — `debug|info|warn|error` (default: `info`)
