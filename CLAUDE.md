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
npm run build                    # Build → dist/ (all three entry points)
npm run start:dev:stdio          # STDIO mode with watch
npm run start:dev:http           # HTTP mode with watch

npm run start:dev:tunnel         # Tunnel mode with watch + debug

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

Three entry points compiled in a single build:

| Mode | Entry | Use Case | Logging |
|------|-------|----------|---------|
| STDIO | `dist/main-stdio.js` | Claude Desktop, MCP clients | stderr |
| HTTP | `dist/main-http.js` | Web-based AI (ChatGPT, claude.ai) | stdout |
| Tunnel | `dist/main-tunnel.js` | Remote access via WebSocket tunnel | stderr |

### Core Files

```
src/
├── main-stdio.ts            # STDIO bootstrap: NestFactory.createApplicationContext()
├── main-http.ts             # HTTP bootstrap: NestFactory.create() + guards
├── main-tunnel.ts           # Tunnel bootstrap: auth commands + WebSocket tunnel
├── app.module.ts            # Root module with forStdio()/forHttp()/forTunnel() factories
├── bootstrap.ts             # Shared logger setup (pino → NestJS LoggerService)
├── cli.ts                   # Commander CLI with subcommands: default (server), --tunnel, --login, --logout
├── app-config.service.ts    # IAnkiConfig implementation (reads from validated AppConfig)
├── config/                  # Zod-validated config system (schema, factory, APP_CONFIG token)
├── tunnel/                  # Tunnel mode: WebSocket client, OAuth device flow, credentials
│   ├── tunnel.client.ts     # WebSocket client for tunnel server
│   ├── tunnel-mcp.service.ts # Bridges MCP ↔ tunnel via InMemoryTransport
│   ├── device-flow.service.ts # OAuth device flow authentication
│   ├── credentials.service.ts # Persistent credential storage
│   └── commands/            # CLI command handlers (login, logout, tunnel)
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
AppModule.forStdio()/forHttp()/forTunnel()
  → McpModule.forRoot()           # STDIO, STREAMABLE_HTTP, or empty transport (tunnel)
  → McpPrimitivesAnkiEssentialModule.forRoot()
  → McpPrimitivesAnkiGuiModule.forRoot()
```

All tools/prompts/resources are providers auto-discovered by `@rekog/mcp-nest`. MCP-Nest 1.9.0+ requires tools to also be listed in `AppModule.providers` (see `ESSENTIAL_MCP_TOOLS` and `GUI_MCP_TOOLS` arrays).

**Tunnel mode** uses `McpModule.forRoot({ transport: [] })` -- no built-in transport. Instead, `TunnelMcpService` connects an `InMemoryTransport` to the MCP server, and `TunnelClient` bridges it to the remote tunnel server over WebSocket.

### Key Patterns

**Tool response format**: Success paths return raw objects matching the tool's `outputSchema`. The mcp-nest handler validates and wraps them automatically. Error paths use `createErrorResponse(error, context)` from `anki.utils.ts` which returns `CallToolResult` with `isError: true` and bypasses outputSchema validation.

**Action tool pattern**: Complex tools like `deckActions`, `tagActions`, `mediaActions` use a dispatch pattern — a single `@Tool` with an `action` discriminant that switches to handler functions in an `actions/` subdirectory. Each action is a pure function taking `(params, ankiClient)`.

**Read-only mode**: `AnkiConnectClient` enforces read-only mode by checking actions against a `WRITE_ACTIONS` set before sending requests. Throws `ReadOnlyModeError`. Review/scheduling operations are always allowed.

**Config system**: Two injection tokens:
- `APP_CONFIG` — validated `AppConfig` object (Zod schema in `src/config/config.schema.ts`). Provided as `useValue` after parsing env + CLI overrides.
- `ANKI_CONFIG` — AnkiConnect-specific config interface. Provided via `useClass: AppConfigService` in each module's `forRoot()`. Modules can swap the config provider for testing.

**Environment Configuration**: All `process.env.*` reads go through `buildConfigInput()` in `src/config/config.factory.ts`. CLI args override env vars in memory (no `process.env` mutation). Services inject `AppConfigService` for type-safe access.

### Build & Tooling Notes

- **NestJS CLI** builds the project (`nest build`). Asset copying is configured in `nest-cli.json` — all `**/*.md` files in `src/` are copied to `dist/`. This matters for prompt templates that reference markdown files.
- **ESLint flat config** (`eslint.config.mjs`) — not legacy `.eslintrc`. Uses `typescript-eslint` + Prettier integration.
- **TypeScript**: `strict: true`, target ES2023, `nodenext` module resolution. Path aliases are resolved by both `tsconfig.json` and Jest's `moduleNameMapper`.
- **Zod 4** (`^4.3.6`) — not Zod 3. Some patterns like `z.preprocess` in `config.schema.ts` are Zod 3 holdovers that still work but may need migration.

### Path Aliases

- `@/*` → `src/*`
- `@test/*` → `test/*`

### Logging Guidelines

**Two types of output - don't mix them:**

1. **CLI Output** (user-facing, clean, no timestamps):
   ```typescript
   import { cli } from '@/cli';

   cli.success('Connected to Anki');      // ✓ Connected to Anki
   cli.error('Connection failed');         // ✗ Connection failed
   cli.info('Starting server...');         // Starting server...
   cli.box('Tunnel URL', 'https://...');   // Boxed message
   cli.blank();                            // Empty line
   ```

2. **Logger** (internal logging, with timestamps and levels):
   ```typescript
   import { Logger } from '@nestjs/common';

   private readonly logger = new Logger(MyService.name);

   this.logger.log('Info message');
   this.logger.warn('Warning message');
   this.logger.error('Error message');
   this.logger.debug('Debug message');
   ```

**When to use which:**
- `cli.*` → User-facing output in CLI commands (tunnel, login, logout, startup banners)
- `Logger` → Internal service logging, debugging, warnings

**Never use raw `console.log/error/warn`** - use `cli.*` or `Logger` instead.

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
// 3. @Tool({ name, description, parameters, outputSchema, annotations }) decorator
// 4. execute() method calling AnkiConnectClient.invoke()
// 5. Success: return raw object matching outputSchema (handler wraps it automatically)
// 6. Error: return createErrorResponse() (bypasses outputSchema validation)
```

**outputSchema**: All tools define a Zod `outputSchema` in the `@Tool` decorator. The mcp-nest handler validates success returns via `safeParse()` and wraps them as `structuredContent`. Error returns via `createErrorResponse()` have a `content` array and bypass schema validation.

**annotations**: All tools declare `readOnlyHint`, `destructiveHint`, and optionally `idempotentHint` in the `@Tool` decorator.

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
4. GitHub Actions handles: version sync, build, MCPB bundle, npm publish, GitHub release

**npm publishing** uses OIDC Trusted Publishing (no `NPM_TOKEN` needed). The `--provenance` flag triggers OIDC auth and generates cryptographic attestations. Configured in `npm-publish.yml` and `npm-publish-legacy.yml`.

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

Key environment variables (all have defaults, see `src/config/config.schema.ts`):
- `ANKI_CONNECT_URL` — AnkiConnect URL (default: `http://localhost:8765`)
- `ANKI_CONNECT_API_KEY` — Optional AnkiConnect API key
- `TUNNEL_SERVER_URL` — Tunnel server WebSocket URL (default: `wss://tunnel.ankimcp.ai`)
- `TUNNEL_AUTH_URL`, `TUNNEL_AUTH_REALM`, `TUNNEL_AUTH_CLIENT_ID` — OAuth/OIDC settings for tunnel auth
- `LOG_LEVEL` — `debug|info|warn|error` (default: `info`)
