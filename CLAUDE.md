# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that enables AI assistants to interact with Anki via the AnkiConnect plugin. Built with NestJS and the `@rekog/mcp-nest` library, it exposes Anki functionality as MCP tools, prompts, and resources.

**Version**: 0.10.0 (Beta) - This project is in active development. Breaking changes may occur in 0.x versions.

**License**: AGPL-3.0-or-later - Changed from MIT to enable future integration of Anki source code. See README.md for details.

**Important**: Check `.claude-draft/` directory for analysis documents, implementation plans, test plans, and project summaries created during development planning sessions:
- `PROJECT_SUMMARY.md` - Overall project architecture and design decisions
- `TEST_PLAN.md` - Testing strategy and implementation guidelines
- `HTTP_MODE_ANALYSIS.md` - HTTP transport mode technical details
- `architecture-tunnel.md` - Ngrok tunnel integration architecture
- `gui-tools-implementation-plan.md` - GUI tools design and planning
- `MODEL_ACTIONS_IMPLEMENTATION_PLAN.md` - Model creation/modification tools
- `ACTIONS_IMPLEMENTATION.md` - AnkiConnect API implementation status tracking (32/127 actions completed)
- `CLA_IMPLEMENTATION_GUIDE.md` - Contributor License Agreement implementation
- `RAG_IMPLEMENTATION_PLAN.md` - RAG (Retrieval Augmented Generation) feature planning

**NPM Package**: Published as `@ankimcp/anki-mcp-server` on npm registry for global installation. The old `anki-mcp-http` package continues to be published for backward compatibility but is deprecated.

## Essential Commands

### Development
```bash
# Building
npm run build           # Build project → dist/ (includes both entry points)

# Development servers
npm run start:dev:stdio # STDIO mode with watch (auto-rebuild)
npm run start:dev:http  # HTTP mode with watch (auto-rebuild)

# Production
npm run start:prod:stdio   # Run STDIO mode: node dist/main-stdio.js
npm run start:prod:http    # Run HTTP mode: node dist/main-http.js

# Code quality
npm run type-check      # Run TypeScript type checking without emitting
npm run lint            # Run ESLint with auto-fix
npm run format          # Format code with Prettier
```

### Testing
```bash
npm test                           # Run all tests
npm run test:unit                  # Unit tests only (*.spec.ts files)
npm run test:tools                 # Essential tool tests in __tests__/
npm run test:workflows             # Workflow integration tests in test/workflows
npm run test:cov                   # Tests with coverage report
npm run test:watch                 # Tests in watch mode
npm run test:debug                 # Tests with Node debugger
npm run test:ci                    # CI mode: silent with coverage
npm run test:single                # Example: modify path in package.json script to run a specific test

# Run a single test file (recommended):
npm test -- path/to/test.spec.ts  # Example: npm test -- src/mcp/primitives/gui/tools/__tests__/gui-browse.tool.spec.ts

# E2E Tests (requires Docker)
npm run e2e:up                     # Start Anki + AnkiConnect Docker containers
npm run e2e:down                   # Stop Docker containers
npm run e2e:logs                   # View container logs
npm run e2e:test                   # Run E2E tests (containers must be running)
npm run e2e:test:http              # Run HTTP-specific E2E tests
npm run e2e:test:stdio             # Run STDIO-specific E2E tests
npm run e2e:full:local             # Full E2E suite: start containers, run tests, cleanup
```

Test coverage thresholds are enforced at 70% for branches, functions, lines, and statements.

**Pre-push Hook**: Automatically runs lint, type-check, and tests before pushing (via Husky).

### Debugging
```bash
# Development with debugger attached
npm run start:debug:stdio          # STDIO mode with debugger on port 9229
npm run start:debug:http           # HTTP mode with debugger on port 9229

# MCP Inspector (interactive testing UI)
npm run inspector:stdio            # Run MCP inspector for STDIO mode
npm run inspector:stdio:debug      # Run STDIO inspector with debugger on port 9229
npm run inspector:http             # Run MCP inspector for HTTP mode
```

After running `inspector:stdio:debug` or `start:debug:*`, attach your IDE debugger to port 9229. The inspector version pauses at startup waiting for debugger attachment.

## Architecture

### Core Structure

The application follows a modular NestJS architecture with MCP primitives organized into feature modules:

- **`src/main-stdio.ts`** - STDIO mode entry point
- **`src/main-http.ts`** - HTTP mode entry point
- **`src/cli.ts`** - CLI argument parsing with commander (--port, --host, --anki-connect flags)
- **`src/bootstrap.ts`** - Shared utilities for logger creation
- **`src/app.module.ts`** - Root module with forStdio() and forHttp() factory methods
- **`src/anki-config.service.ts`** - Configuration service implementing `IAnkiConfig`
- **`src/http/guards/origin-validation.guard.ts`** - Origin validation for HTTP mode security
- **`bin/ankimcp.js`** - CLI wrapper for npm global install (routes to main-http.js or main-stdio.js based on --stdio flag)
  - Exposed as both `ankimcp` and `anki-mcp-server` commands when installed globally (see package.json bin field)

### Transport Modes

The server supports two MCP transport modes via **separate entry points**:

**STDIO Mode**:
- Entry point: `dist/main-stdio.js`
- For local MCP clients (Claude Desktop, MCP Inspector)
- Standard input/output communication
- Logger writes to stderr (fd 2)
- Run: `npm run start:prod:stdio` or `node dist/main-stdio.js`

**HTTP Mode (Streamable HTTP)**:
- Entry point: `dist/main-http.js`
- For remote MCP clients, web-based integrations
- Uses MCP Streamable HTTP protocol (SSE is deprecated)
- Logger writes to stdout (fd 1)
- Default: `http://127.0.0.1:3000` (localhost-only)
- MCP endpoint at root: `http://127.0.0.1:3000/`
- Run: `npm run start:prod:http` or `node dist/main-http.js`
- CLI options: `--port`, `--host`, `--anki-connect`, `--ngrok` (parsed by `src/cli.ts` using commander)
- NPM package: `npx @ankimcp/anki-mcp-server` (HTTP mode) or `npx @ankimcp/anki-mcp-server --stdio` (STDIO mode)
- Ngrok integration: `npx @ankimcp/anki-mcp-server --ngrok` (requires global ngrok installation)

**Key Implementation Details**:
- Both entry points compile together in single build (`npm run build`)
- Each has its own bootstrap logic:
  - `src/main-stdio.ts`: `NestFactory.createApplicationContext()` + AppModule.forStdio()
  - `src/main-http.ts`: `NestFactory.create()` + AppModule.forHttp() + guards
- Shared utilities in `src/bootstrap.ts` (logger creation)
- HTTP mode uses `mcpEndpoint: '/'` to mount MCP at root path

**Security (HTTP Mode)**:
- Origin header validation via `OriginValidationGuard` (prevents DNS rebinding)
- Binds to 127.0.0.1 by default (localhost-only)
- No authentication (OAuth support planned for future)

### MCP Primitives Organization

MCP primitives (tools, prompts, resources) are organized in feature modules:

**`src/mcp/primitives/essential/`** - Core Anki functionality
- **Tools**: `src/mcp/primitives/essential/tools/*.tool.ts` - MCP tools for Anki operations
  - Review: `sync`, `get-due-cards`, `get-cards`, `present-card`, `rate-card`
  - Decks: `list-decks`, `create-deck`
  - Notes: `add-note`, `find-notes`, `notes-info`, `update-note-fields`, `delete-notes`
  - Tags: `get-tags` (discover existing tags to prevent duplication)
  - Media: `mediaActions` (storeMediaFile, retrieveMediaFile, getMediaFilesNames, deleteMediaFile)
  - Models: `model-names`, `model-field-names`, `model-styling`, `create-model`, `update-model-styling`
- **Prompts**: `src/mcp/primitives/essential/prompts/*.prompt.ts` - MCP prompts (e.g., `review-session`)
- **Resources**: `src/mcp/primitives/essential/resources/*.resource.ts` - MCP resources (e.g., `system-info`)
- **`index.ts`** - Module definition with `McpPrimitivesAnkiEssentialModule.forRoot()`

**`src/mcp/primitives/gui/`** - GUI-specific primitives for Anki interface operations
- **Tools**: `src/mcp/primitives/gui/tools/*.tool.ts` - MCP tools for GUI operations
  - Browser: `gui-browse`, `gui-select-card`, `gui-selected-notes`
  - Dialogs: `gui-add-cards`, `gui-edit-note`, `gui-deck-overview`, `gui-deck-browser`
  - Utilities: `gui-current-card`, `gui-show-question`, `gui-show-answer`, `gui-undo`
- **`index.ts`** - Module definition with `McpPrimitivesAnkiGuiModule.forRoot()`
- **IMPORTANT**: GUI tools require explicit user approval - they are for note editing/creation workflows only, NOT for review sessions

### Supporting Infrastructure

- **`src/mcp/clients/anki-connect.client.ts`** - HTTP client for AnkiConnect API using `ky`
  - Handles request/response formatting, error handling, retries
  - Injectable service used by all tools
- **`src/mcp/types/anki.types.ts`** - TypeScript types for AnkiConnect API
- **`src/mcp/config/anki-config.interface.ts`** - Configuration interface (`IAnkiConfig`, `ANKI_CONFIG` token)
- **`src/mcp/utils/anki.utils.ts`** - Shared utility functions
- **`src/services/ngrok.service.ts`** - Ngrok tunnel management (HTTP mode only)
  - Spawns global ngrok binary as child process
  - Extracts public URL from ngrok's local API (port 4040)
  - Handles cleanup on process exit (SIGINT, SIGTERM, uncaughtException)
  - See `.claude-draft/ngrok-integration.md` for implementation details

### Module System

The project uses NestJS dynamic modules with dependency injection:

1. `AppModule` imports `McpModule.forRoot()` with transport mode
2. `McpPrimitivesAnkiEssentialModule.forRoot()` and `McpPrimitivesAnkiGuiModule.forRoot()` receive `ankiConfigProvider`
3. All tools/prompts/resources are registered as providers and auto-discovered by `@rekog/mcp-nest`

### Testing Structure

- **Unit tests**:
  - `src/mcp/primitives/essential/tools/__tests__/*.spec.ts` - Test essential tools
  - `src/mcp/primitives/essential/prompts/__tests__/*.spec.ts` - Test essential prompts
  - `src/mcp/primitives/essential/resources/__tests__/*.spec.ts` - Test essential resources
  - `src/mcp/primitives/gui/tools/__tests__/*.spec.ts` - Test GUI tools
  - `src/mcp/clients/__tests__/*.spec.ts` - Test client implementations
- **Workflow tests**: `test/workflows/*.spec.ts` - Integration tests for multi-tool workflows
- **E2E tests**: `test/*.e2e-spec.ts` - End-to-end application tests
- **Mocks**: `src/mcp/clients/__mocks__/` - Mock implementations for testing
- **Test helpers**: `src/test-fixtures/test-helpers.ts` - Shared utilities like `parseToolResult()` and `createMockContext()`

## Key Implementation Details

### AnkiConnect Communication

All Anki operations go through `AnkiConnectClient`:
- Uses `ky` HTTP client with retry logic (2 retries, exponential backoff)
- Formats requests with `action`, `version`, `key`, and `params`
- Throws `AnkiConnectError` on API errors with action context
- Configured via environment variables (see README.md)

### MCP Tool Pattern

Each tool follows this structure:
1. Extends base tool class from `@rekog/mcp-nest`
2. Defines Zod schema for input validation
3. Implements `execute()` method that calls `AnkiConnectClient`
4. Returns strongly-typed results

Example: `src/mcp/primitives/essential/tools/sync.tool.ts`

**Dispatcher Pattern (Experimental)**:
The `mediaActions` tool uses a unified dispatcher pattern to consolidate related operations:
- Single tool with `action` parameter (enum: storeMediaFile, retrieveMediaFile, getMediaFilesNames, deleteMediaFile)
- Action implementations in separate files under `mediaActions/actions/*.action.ts`
- Pure functions that accept params and `AnkiConnectClient`
- Main tool dispatches to appropriate action based on `action` parameter
- **Purpose**: Reduce tool approval fatigue (4 operations → 1 approval)
- **Trade-off**: Less discoverable but fewer user clicks
- Currently experimental - gathering user feedback before wider adoption

Example: `src/mcp/primitives/essential/tools/mediaActions/mediaActions.tool.ts`

### Environment Configuration

Default AnkiConnect URL is `http://localhost:8765` (see `src/anki-config.service.ts:16`). Override with `ANKI_CONNECT_URL` environment variable.

### Path Aliases

TypeScript path aliases are configured:
- `@/*` → `src/*`
- `@test/*` → `test/*`

These work in both source code and tests via Jest's `moduleNameMapper`.

## Working with This Codebase

### Adding a New MCP Tool

**Essential Tools** (general Anki operations):
1. Create `src/mcp/primitives/essential/tools/your-tool.tool.ts`
2. Export it from `src/mcp/primitives/essential/index.ts`
3. Add to `MCP_PRIMITIVES` array in the same file
4. **Update `manifest.json`** - Add the new tool to the `tools` array (don't forget this!)
5. Create test file: `src/mcp/primitives/essential/tools/__tests__/your-tool.tool.spec.ts`
6. Run `npm run test:tools` to verify

**GUI Tools** (Anki interface operations):
1. Create `src/mcp/primitives/gui/tools/your-gui-tool.tool.ts`
2. Export it from `src/mcp/primitives/gui/index.ts`
3. Add to `MCP_PRIMITIVES` array in the same file
4. **Update `manifest.json`** - Add the new tool to the `tools` array (don't forget this!)
5. Add dual warnings in tool description:
   - "IMPORTANT: Only use when user explicitly requests..."
   - "This tool is for note editing/creation workflows, NOT for review sessions"
6. Create test file: `src/mcp/primitives/gui/tools/__tests__/your-gui-tool.tool.spec.ts`
7. Run `npm test -- src/mcp/primitives/gui/tools/__tests__/your-gui-tool.tool.spec.ts` to verify

### Adding a New MCP Prompt

**Essential Prompts** (general use):
1. Create `src/mcp/primitives/essential/prompts/your-prompt.prompt.ts`
2. Export it from `src/mcp/primitives/essential/index.ts`
3. Add to `MCP_PRIMITIVES` array
4. Prompts define reusable conversation starters for AI assistants

**GUI Prompts** (if needed):
- Follow the same pattern but in `src/mcp/primitives/gui/prompts/`

### Testing Best Practices

- Mock `AnkiConnectClient` in unit tests (see existing test files for examples)
- Use workflow tests for multi-step scenarios
- Run `npm run test:cov` to check coverage before committing
- Use `npm run test:watch` during development

### Debugging Tips

- **STDIO mode**: Logs go to stderr (fd 2) to keep stdout clear for MCP protocol
- **HTTP mode**: Logs go to stdout (fd 1) for standard HTTP logging
- Set `LOG_LEVEL=debug` environment variable for verbose logging
- Use `npm run inspector:stdio:debug` + IDE debugger for step-through debugging
- MCP Inspector provides a web UI for testing tools interactively

### Ngrok Integration (HTTP Mode)

The server supports integrated ngrok tunneling via the `--ngrok` flag:

```bash
# Start with ngrok tunnel
@ankimcp/anki-mcp-server --ngrok

# With custom port
@ankimcp/anki-mcp-server --port 8080 --ngrok

# Or with npx
npx @ankimcp/anki-mcp-server --ngrok
```

**Prerequisites:**
1. Install ngrok globally: `npm install -g ngrok`
2. Setup auth token: `ngrok config add-authtoken <your-token>`
3. Get auth token from: https://dashboard.ngrok.com/get-started/your-authtoken

**How It Works:**
- Spawns global ngrok binary as child process (shell execution)
- Extracts public URL from ngrok's local API (http://localhost:4040/api/tunnels)
- Displays tunnel URL in startup banner
- Handles cleanup on Ctrl+C (SIGINT, SIGTERM, exit signals)
- Gracefully degrades if ngrok fails (server still runs locally)

**Implementation Details:**
- Service: `src/services/ngrok.service.ts`
- Integration: `src/main-http.ts` bootstrap
- CLI: `src/cli.ts` (--ngrok flag parsing)
- Full documentation: `.claude-draft/architecture-tunnel.md`

**Legal/License:**
- Uses shell execution (not embedded package)
- No ngrok code distribution
- Users manage their own ngrok accounts
- Safe for commercial use
- Future: Will add `tunnel.ankimcp.io` as alternative

### NPM Package Testing (Local)

Test the npm package locally before publishing:

```bash
npm run pack:local         # Builds and creates @ankimcp/anki-mcp-server-*.tgz
npm run install:local      # Installs from ./@ankimcp/anki-mcp-server-*.tgz globally

# Test both modes with global install:
@ankimcp/anki-mcp-server              # Test HTTP mode (default)
@ankimcp/anki-mcp-server --stdio      # Test STDIO mode (for MCP clients)
@ankimcp/anki-mcp-server --ngrok      # Test HTTP mode with ngrok tunnel

# Or test with npx (simulates user experience):
npx ./@ankimcp/anki-mcp-server-*.tgz                # Test HTTP mode via npx
npx ./@ankimcp/anki-mcp-server-*.tgz --stdio        # Test STDIO mode via npx
npx ./@ankimcp/anki-mcp-server-*.tgz --ngrok        # Test ngrok integration via npx

npm run uninstall:local    # Removes global installation
```

This simulates the full user experience of installing via `npm install -g @ankimcp/anki-mcp-server` by creating and installing from a local `.tgz` package.

**Testing STDIO mode with MCP clients:**
- **Cursor IDE**: Configure `~/.cursor/mcp.json` with `npx @ankimcp/anki-mcp-server --stdio`
- **Cline**: Configure via settings UI with `npx @ankimcp/anki-mcp-server --stdio`
- **Zed Editor**: Install as MCP extension (STDIO only)

### MCPB Bundle Distribution

The project can be packaged as an MCPB (Model Context Protocol Bundle) for one-click installation:

```bash
npm run mcpb:bundle           # Sync version, build, pack, and clean (optimizes bundle size)
npm run mcpb:clean            # Remove old .mcpb files
npm run sync-version          # Sync version from package.json to manifest.json
```

**Key Points**:
- `mcpb:bundle` automatically syncs version from `package.json` to `manifest.json` before building
- **Bundle Optimization**: The script includes `mcpb clean` step which removes devDependencies from the bundle (47MB → ~10MB)
- **Bundle Filename**: Uses hardcoded name `anki-mcp-server` with version from package.json to create `anki-mcp-server-0.x.x.mcpb`. This avoids issues with special characters in scoped package names (`@ankimcp/anki-mcp-server`) which would create directory structures instead of flat files.
- MCPB bundles use **STDIO entry point** (`manifest.json` → `dist/main-stdio.js`)
- User config keys in `manifest.json` **must use snake_case** (e.g., `anki_connect_url`), not camelCase
- MCPB variable substitution syntax: `${user_config.key_name}`
- The `.mcpbignore` file uses patterns like `/src/` (with leading slash) to exclude only root-level directories, not node_modules subdirectories
- Bundle includes: `dist/` (both entry points), `node_modules/` (production only), `package.json`, `manifest.json`, `icon.png`
- Excluded: source files, tests, development configs, devDependencies

**IMPORTANT - Peer Dependencies as Direct Dependencies**:
The `@rekog/mcp-nest` library has peer dependencies that `mcpb clean` would incorrectly remove. These MUST remain as direct dependencies in `package.json`:
- `@nestjs/jwt`, `@nestjs/passport` - Auth modules
- `jsonwebtoken`, `passport`, `passport-jwt` - JWT/Passport runtime
- `zod-to-json-schema` - Schema conversion

If you see "Cannot find module" errors after installing the MCPB bundle, a peer dependency was likely removed.

**Package Manager**: This project is standardized on **npm** (not pnpm or yarn). The `mcpb clean` command doesn't work correctly with pnpm's node_modules structure.

### Versioning Convention

This project follows [Semantic Versioning](https://semver.org/):

- **0.x.x** - Pre-1.0 development/beta (current)
  - `0.1.x` - Bug fixes
  - `0.2.0+` - New features
  - Breaking changes allowed
- **1.0.0** - First stable release (when API is stable)
- **x.0.0** - Major versions (breaking changes after 1.0)

### Release Process

**IMPORTANT**: When creating a new release, follow this checklist:

1. ✅ Update version in `package.json` (single source of truth)
2. ✅ **Add new tools to `manifest.json` tools array** ← DON'T FORGET!
3. ✅ Commit changes
4. ✅ Create and push git tag: `git tag -a v0.x.0 -m "Release message"`
5. ✅ Push tag: `git push origin v0.x.0`
6. ✅ GitHub Actions automatically:
   - Syncs version from `package.json` to `manifest.json`
   - Builds the project
   - Runs `npm run mcpb:bundle`
   - Creates GitHub Release
   - Attaches `.mcpb` file

**Note**: Version is now managed only in `package.json`. The `mcpb:bundle` script automatically syncs it to `manifest.json`.

**DO NOT run `npm run mcpb:bundle` manually** - GitHub Actions handles it automatically when you push a tag.

**Manifest Update Template** (only for new tools):
```json
{
  "tools": [
    // ... existing tools ...
    {
      "name": "newTool",
      "description": "What it does"
    }
  ]
}
```
