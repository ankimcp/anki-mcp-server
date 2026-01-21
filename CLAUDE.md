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

Two separate entry points compiled in single build:

| Mode | Entry | Use Case | Logging |
|------|-------|----------|---------|
| STDIO | `dist/main-stdio.js` | Claude Desktop, MCP clients | stderr |
| HTTP | `dist/main-http.js` | Web-based AI (ChatGPT, claude.ai) | stdout |

### Core Files

```
src/
├── main-stdio.ts          # STDIO bootstrap: NestFactory.createApplicationContext()
├── main-http.ts           # HTTP bootstrap: NestFactory.create() + guards
├── app.module.ts          # Root module with forStdio()/forHttp() factories
├── cli.ts                 # Commander CLI (--port, --host, --anki-connect, --ngrok)
├── anki-config.service.ts # IAnkiConfig implementation
└── mcp/
    ├── clients/anki-connect.client.ts  # HTTP client using ky (retries, error handling)
    ├── primitives/essential/           # Core tools, prompts, resources
    └── primitives/gui/                 # GUI-specific tools (require user approval)
```

### Module System

```
AppModule → McpModule.forRoot() → McpPrimitivesAnkiEssentialModule.forRoot()
                                → McpPrimitivesAnkiGuiModule.forRoot()
```

All tools/prompts/resources are providers auto-discovered by `@rekog/mcp-nest`.

### Path Aliases

- `@/*` → `src/*`
- `@test/*` → `test/*`

## Adding New Tools

### Essential Tools (general Anki operations)

1. Create `src/mcp/primitives/essential/tools/your-tool.tool.ts`
2. Export from `src/mcp/primitives/essential/index.ts`
3. Add to `ESSENTIAL_MCP_TOOLS` array
4. **Update `manifest.json`** ← Don't forget!
5. Create test: `src/mcp/primitives/essential/tools/__tests__/your-tool.tool.spec.ts`

**Note**: `ESSENTIAL_MCP_TOOLS` contains tools, prompts, and resources that MCP-Nest discovers. The separate `ESSENTIAL_MCP_PRIMITIVES` array adds infrastructure like `AnkiConnectClient`.

### GUI Tools (interface operations)

Same as above but in `src/mcp/primitives/gui/`. Must include dual warnings:
- "IMPORTANT: Only use when user explicitly requests..."
- "This tool is for note editing/creation workflows, NOT for review sessions"

### Tool Pattern

```typescript
// 1. Zod schema for input validation
// 2. Extend base tool from @rekog/mcp-nest
// 3. Implement execute() calling AnkiConnectClient
// 4. Return strongly-typed results
```

See `src/mcp/primitives/essential/tools/sync.tool.ts` for minimal example.

## Testing

```bash
npm test -- src/mcp/primitives/essential/tools/__tests__/sync.tool.spec.ts
```

- Mock `AnkiConnectClient` in unit tests (see existing tests)
- Use `test/workflows/*.spec.ts` for multi-tool scenarios
- Test helpers: `src/test-fixtures/test-helpers.ts` (`parseToolResult()`, `createMockContext()`)

### E2E Tests (requires Docker)

```bash
npm run e2e:up              # Start Anki + AnkiConnect containers
npm run e2e:test            # Run E2E tests
npm run e2e:down            # Stop containers
npm run e2e:full:local      # All-in-one: start, test, cleanup
```

## Release Process

1. Update version in `package.json` (single source of truth)
2. **Add new tools to `manifest.json` tools array** ← Critical!
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

Check `.claude-draft/` for implementation plans and analysis:
- `ACTIONS_IMPLEMENTATION.md` - AnkiConnect API coverage tracking
- `PROJECT_SUMMARY.md` - Architecture decisions
- `TEST_PLAN.md` - Testing strategy
- `MODEL_ACTIONS_IMPLEMENTATION_PLAN.md` - Model/template tools
- `gui-tools-implementation-plan.md` - GUI tools implementation

## Environment

Default AnkiConnect URL: `http://localhost:8765` (override: `ANKI_CONNECT_URL`)
