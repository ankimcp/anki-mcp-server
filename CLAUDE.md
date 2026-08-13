# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP server enabling AI assistants to interact with Anki via AnkiConnect. Built with NestJS and `@rekog/mcp-nest`.

- **Package**: `@ankimcp/anki-mcp-server` (npm)
- **License**: MIT
- **Status**: Beta (0.x.x) - breaking changes allowed
- **User-facing docs**: `README.md` covers installation, client setup (Claude Desktop/MCPB, HTTP, tunnel), and the full tool catalog — consult it for anything user-facing rather than reconstructing it here.

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

Three entry points compiled in a single build:

| Mode | Entry | Use Case | Logging |
|------|-------|----------|---------|
| STDIO | `dist/main-stdio.js` | Claude Desktop, MCP clients | stderr |
| HTTP | `dist/main-http.js` | Web-based AI (ChatGPT, claude.ai) | stdout |
| Tunnel | `dist/main-tunnel.js` | Remote access via WebSocket tunnel | stderr |

### Core Files

```
src/
├── main-stdio.ts            # STDIO bootstrap: NestFactory.createMicroservice() with the MCP strategy
├── main-http.ts             # HTTP bootstrap: NestFactory.create() + guards + connectMicroservice()
├── main-tunnel.ts           # Tunnel bootstrap: auth commands + WebSocket tunnel
├── app.module.ts            # Root module with forStdio()/forHttp()/forTunnel() factories
├── bootstrap.ts             # Shared logger setup (pino → NestJS LoggerService) + createMcpStrategy()
├── version.ts               # Package version constant (read from package.json at build)
├── cli/                     # CLI layer (Commander parsing + user-facing output)
│   ├── args.ts              # Commander entrypoint: option parsing, subcommand dispatch
│   ├── cli-output.ts        # User-facing print helpers (cli.success/error/info/box) — separate from args.ts so non-CLI code can use it without pulling in Commander
│   ├── spinner.ts           # Terminal spinner for long-running CLI operations
│   └── index.ts             # Barrel re-export for the cli module
├── app-config.service.ts    # IAnkiConfig implementation (reads from validated AppConfig)
├── config/                  # Zod-validated config system (schema, factory, APP_CONFIG token)
├── services/ngrok.service.ts # Optional ngrok subprocess for HTTP-mode public tunneling
├── http/guards/             # HTTP-only guards: origin-validation + host-validation (DNS-rebinding protection)
├── http/mcp-http.factory.ts # StreamableHttpTransport + the Nest controller that owns the MCP route
├── tunnel/                  # Tunnel mode: WebSocket client, OAuth device flow, credentials
│   ├── tunnel.client.ts     # WebSocket client for tunnel server
│   ├── tunnel.transport.ts  # McpTransport for tunnel mode: owns the bound MCP server + handleRequest()
│   ├── in-memory.transport.ts # SDK Transport that pairs a relayed request with the server's response
│   ├── tunnel.protocol.ts   # WS message type definitions (request/response/ping/error)
│   ├── device-flow.service.ts # OAuth device flow authentication
│   ├── credentials.service.ts # Persistent credential storage
│   └── commands/            # CLI command handlers (login, logout, tunnel)
└── mcp/
    ├── clients/anki-connect.client.ts  # HTTP client using ky (retries, error handling, read-only guard)
    ├── config/anki-config.interface.ts # ANKI_CONFIG injection token + IAnkiConfig interface
    ├── types/anki.types.ts             # Shared Anki types (cards, notes, ratings)
    ├── utils/                          # Shared utilities (anki.utils, markdown.utils, stats.utils, media-validation.utils, card-states.utils, deck-hierarchy.utils)
    ├── primitives/essential/           # Core tools, prompts, resources
    └── primitives/gui/                 # GUI-specific tools (require user approval)
```

### Module System

```
AppModule.forStdio()/forHttp()/forTunnel()
  → MCP_STRATEGY provider           # the McpStrategy the entry point built
  → McpPrimitivesAnkiEssentialModule.forRoot()
  → McpPrimitivesAnkiGuiModule.forRoot()
```

Each entry point builds exactly one `McpStrategy` (`new McpStrategy({ name, version, icons, transports })` — see `createMcpStrategy()` in `bootstrap.ts`) and hands the same instance to both `AppModule.forX()` (as `MCP_STRATEGY`) and the NestJS microservice connection: `createMicroservice()` for STDIO/tunnel, `connectMicroservice()` + `startAllMicroservices()` for HTTP. Transports are instances, not enum values — `new StdioTransport()`, `new StreamableHttpTransport()`, `new TunnelTransport()`.

All tools/prompts/resources are `@McpController()` classes listed in each primitive module's `controllers` array (see `ESSENTIAL_MCP_TOOLS` and `GUI_MCP_TOOLS`). NestJS scans every module's controllers for the `@MessagePattern` handlers that `@Tool`/`@Prompt`/`@Resource` compile to, so `AppModule` does not re-list them.

**HTTP mode** does not let the transport self-mount its route. `createMcpHttpServer()` (`src/http/mcp-http.factory.ts`) builds the MCP endpoint as a controller via the `McpHttpControllerFor(transport)` mixin, so requests run through the Nest pipeline and the Origin/Host `APP_GUARD`s apply. A self-mounted route would register straight on the HTTP adapter and bypass them.

**Tunnel mode** uses `TunnelTransport` (`src/tunnel/tunnel.transport.ts`): it gets a fully-wired server from `ctx.createBoundServer(session)`, connects it to an `InMemoryTransport` channel, and exposes `handleRequest(body)`. `TunnelClient` relays request bodies from the tunnel server over WebSocket into that method. Bootstrap lives in `src/tunnel/commands/tunnel.command.ts`. The bound server is created with `era: "legacy"`, so tunnel mode serves only the 2025 protocol revision — STDIO and HTTP also negotiate the 2026-07-28 revision.

### Key Patterns

**Tool response format**: Success paths return raw objects matching the tool's `outputSchema`. The mcp-nest handler validates and wraps them automatically. Error paths use `createErrorResponse(error, context)` from `anki.utils.ts` which returns `CallToolResult` with `isError: true` and bypasses outputSchema validation.

**Action helper pattern**: The former aggregate tools (`deckActions`, `tagActions`, `mediaActions`) were split into single-purpose tools (`list-decks.tool.ts`, `deck-stats.tool.ts`, `create-deck.tool.ts`, `change-deck.tool.ts`, `store-media-file.tool.ts`, `replace-tags.tool.ts`, …). Their directories now hold only `actions/*.action.ts` — pure functions taking `(params, ankiClient)` that the split tools import. The tool class stays thin: log, call the helper, wrap failures in `createErrorResponse`.

**Read-only mode**: `AnkiConnectClient` enforces read-only mode by checking actions against a `WRITE_ACTIONS` set before sending requests. Throws `ReadOnlyModeError`. Review/scheduling operations are always allowed.

**Config system**: Two injection tokens:
- `APP_CONFIG` — validated `AppConfig` object (Zod schema in `src/config/config.schema.ts`). Provided as `useValue` after parsing env + CLI overrides.
- `ANKI_CONFIG` — AnkiConnect-specific config interface. Provided via `useClass: AppConfigService` in each module's `forRoot()`. Modules can swap the config provider for testing.

**Environment Configuration**: Config `process.env.*` reads go through `buildConfigInput()` in `src/config/config.factory.ts`. CLI args override env vars in memory (no `process.env` mutation). Services inject `AppConfigService` for type-safe access. Two deliberate exceptions sit outside the config system: `media-validation.utils.ts` (`MEDIA_*`) and `system-info.resource.ts` read `process.env` directly.

### Upstream AnkiConnect Quirks

These are upstream behaviors that shape tool design — surface them in tool descriptions so the AI can avoid them:

- **`updateNoteFields` silently fails** if the target note is open in Anki's Browse window. The request returns 200 but fields don't persist. Warn users in the tool description.
- **Model CSS is per-note-type, not per-note.** Use `modelStyling` to fetch CSS for a model; `notesInfo` tells you which model each note uses. `updateNoteFields` should preserve inline styles.
- **`sync` relies on the desktop app being logged into AnkiWeb.** There's no API path to authenticate — surface a helpful error hint.
- **`deleteNotes` is irreversible and cascades to all cards** of the note. The tool requires explicit `confirmDeletion: true`.

### Build & Tooling Notes

- **NestJS CLI** builds the project (`nest build`). Asset copying is configured in `nest-cli.json` — all `**/*.md` files in `src/` are copied to `dist/`. This matters for prompt templates that reference markdown files.
- **`prebuild` hook** runs `scripts/generate-icon.mjs` before every `npm run build` (via npm's `pre*` lifecycle) — that's why an icon-generation step fires on build. It's expected, not a stray command.
- **ESLint flat config** (`eslint.config.mjs`) — not legacy `.eslintrc`. Uses `typescript-eslint` + Prettier integration.
- **TypeScript**: `strict: true`, target ES2023, `nodenext` module resolution. Path aliases are resolved by both `tsconfig.json` and Jest's `moduleNameMapper`.
- **Zod 4** (`^4.4.3`) — not Zod 3. Some patterns like `z.preprocess` in `config.schema.ts` are Zod 3 holdovers that still work but may need migration.

### Path Aliases

- `@/*` → `src/*`
- `@test/*` → `test/*`

### Key Dependencies

- **Zod v4** (`zod@^4.x`) — NOT v3. Zod 4 has different APIs (e.g., `z.interface()`, changed error handling). Don't use v3 patterns.
- **`@rekog/mcp-nest` v2** (`^2.0.0`) — NOT v1. No `McpModule.forRoot()`: the server is a NestJS microservice `CustomTransportStrategy` (`McpStrategy`), capability classes are `@McpController()`s, and handler methods take `@Payload()`.
- **`@modelcontextprotocol/{core,node,server}` v2** — the MCP SDK. The old single `@modelcontextprotocol/sdk` package is gone. Don't bump without testing MCP protocol compatibility.
- **`@nestjs/microservices`** — required by mcp-nest v2 (`CustomStrategy`, `@Payload()`), not optional.
- **TypeScript** — `strict: true`, `module: "nodenext"`, target `ES2023`. Path aliases (`@/`, `@test/`) handle most imports.
- **ESLint** — Flat config (`eslint.config.mjs`), not legacy `.eslintrc`.


### Logging Guidelines

**Two types of output - don't mix them:**

1. **CLI Output** (user-facing, clean, no timestamps):
   ```typescript
   import { cli } from '@/cli/cli-output';

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

**Note**: `ESSENTIAL_MCP_TOOLS` is the module's `controllers` array — tools, prompts, and resources that MCP-Nest discovers. Infrastructure (`AnkiConnectClient`, the config providers) is listed inline in the module's `providers`.

If the AnkiConnect logic is bulky or shared with another tool, put it in a pure `actions/*.action.ts` helper and keep the tool class thin — see `list-decks.tool.ts` → `deckActions/actions/listDecks.action.ts`.

For tools with complex output schemas, extract Zod types into a `*.types.ts` file alongside the tool (see `collection-stats/collection-stats.types.ts` and `review-stats/review-stats.types.ts`).

### GUI Tools (interface operations)

Same as above but in `src/mcp/primitives/gui/`. Must include dual warnings:
- "IMPORTANT: Only use when user explicitly requests..."
- "This tool is for note editing/creation workflows, NOT for review sessions"

### Tool Pattern

```typescript
// 1. Zod schema for input validation
// 2. @McpController() class with AnkiConnectClient injected (registered as a module controller)
// 3. @Tool({ name, description, parameters, outputSchema, annotations }) decorator
// 4. Handler method taking @Payload() params, calling AnkiConnectClient.invoke()
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
  - Tool-level tests live next to each tool (e.g. `src/mcp/primitives/essential/tools/__tests__/`).
  - App-level wiring tests live in `src/__tests__/` (`app-config.service.spec.ts`, `cli.spec.ts`, `main-http.spec.ts`) — bootstrap, CLI parsing, config validation.
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
- Peer dependencies of `@rekog/mcp-nest` must stay as direct deps (`@modelcontextprotocol/{core,node,server}`, `@nestjs/microservices`)
- `mcpb clean` removes devDeps to optimize size (47MB → ~10MB)
- Use **npm** (not pnpm) - `mcpb clean` doesn't work with pnpm's node_modules

## Environment

Node.js requirement: `>=22.12.0` (Node 20 reached end-of-life on 2026-04-30; oldest supported LTS is Node 22). That is the runtime floor — the highest `engines.node` among production deps is `commander`'s `>=22.12.0`.

**Development needs a newer Node than `engines` declares**: `@modelcontextprotocol/inspector` (devDependency, drives the E2E suite) requires `>=22.19.0`. `engines.node` deliberately stays at the runtime floor so consumers aren't forced higher for a tool they never install. On an older Node 22, `npm install` warns `EBADENGINE` and E2E fails.

Key environment variables (all have defaults, see `src/config/config.schema.ts`):
- `ANKI_CONNECT_URL` — AnkiConnect URL (default: `http://localhost:8765`)
- `ANKI_CONNECT_API_KEY` — Optional AnkiConnect API key
- `TUNNEL_SERVER_URL` — Tunnel server WebSocket URL (default: `wss://tunnel.ankimcp.ai`)
- `TUNNEL_AUTH_CLIENT_ID` — OAuth/OIDC client ID for tunnel auth
- `LOG_LEVEL` — `debug|info|warn|error` (default: `info`)
- `READ_ONLY` — `true|1` to block write operations (enforced in `AnkiConnectClient`)

### Media Security

The media tools (`storeMediaFile`, `retrieveMediaFile`, `deleteMediaFile`) and `updateNoteFields` audio/picture/video fields validate inputs against prompt-injection and SSRF attacks:

- **File paths** — MIME-type allowlist (media only). Non-media files (SSH keys, creds, shell configs) are rejected.
  - `MEDIA_ALLOWED_TYPES` — extra MIME types (comma-separated)
  - `MEDIA_IMPORT_DIR` — restrict imports to a specific directory
- **URLs** — SSRF guard blocks loopback (127.x), RFC1918 (10/8, 172.16/12, 192.168/16), link-local (169.254.x), and non-HTTP(S) schemes.
  - `MEDIA_ALLOWED_HOSTS` — allowlist specific private hosts (e.g., `192.168.1.50,my-nas`)
- **Filenames** — path-traversal sanitization (`../`, absolute paths stripped).

Validation lives in `src/mcp/utils/media-validation.utils.ts`; callers are `mediaActions/actions/{store,retrieve,delete}MediaFile.action.ts` and `update-note-fields.tool.ts`. Unit coverage in `src/mcp/utils/__tests__/media-validation.utils.spec.ts`, E2E in `test/e2e/media-security.stdio.e2e-spec.ts`. When touching these, always add a test — the recent path-traversal fix (commit f94cfb8) was reported externally.
