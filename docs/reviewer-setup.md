# Reviewer Setup Guide

## Purpose

This guide takes an Anthropic MCP Directory reviewer from zero to a working Anki MCP server integration in approximately 10 minutes.

## Prerequisites

- **Anki Desktop** (any recent version) — [apps.ankiweb.net](https://apps.ankiweb.net/)
- **Node.js 20.19.0+** or **22.12.0+** — Node 21.x is not supported (the `require(esm)` feature was never backported to the 21.x line). See the [Troubleshooting / ERR_REQUIRE_ESM section](../README.md#err_require_esm-error) of the root README for background.
- **An MCP client** — Claude Desktop recommended; [MCP Inspector](https://github.com/modelcontextprotocol/inspector) is acceptable for tool-level verification.

## 1. Install Anki Desktop

Download and install from [apps.ankiweb.net](https://apps.ankiweb.net/). Launch once to confirm the install completes and the main window opens.

## 2. Install the AnkiConnect add-on

1. In Anki: **Tools → Add-ons → Get Add-ons…**
2. Enter code **`2055492159`**
3. Restart Anki
4. Verify AnkiConnect is running: open <http://localhost:8765> in a browser. Expected response: the plaintext string `AnkiConnect`.

## 3. Import the sample deck

1. Download [`./MCP%20Reviewer%20Demo.apkg`](./MCP%20Reviewer%20Demo.apkg) (58 KB, 20 Spanish→English vocabulary cards, Basic note type, tagged `mcp-reviewer-demo` and `spanish`).
2. Double-click the file, or in Anki: **File → Import** and select it.
3. Confirm the import dialog reports **20 notes** imported. A deck named **`MCP Reviewer Demo`** should appear in the deck list.

## 4. Install the MCP server

Three installation options. Option A is recommended for Claude Desktop reviewers.

### Option A (recommended for Claude Desktop): MCPB bundle

1. Download the latest `.mcpb` bundle from [GitHub Releases](https://github.com/ankimcp/anki-mcp-server/releases).
2. In Claude Desktop: **Settings → Extensions**, then drag-drop the `.mcpb` file.
3. Restart Claude Desktop if prompted.

### Option B (any STDIO MCP client): npx

Add to your MCP client config:

```json
{
  "mcpServers": {
    "anki": {
      "command": "npx",
      "args": ["-y", "@ankimcp/anki-mcp-server", "--stdio"]
    }
  }
}
```

### Option C (source-level review): local build

```bash
git clone https://github.com/ankimcp/anki-mcp-server.git
cd anki-mcp-server
npm ci
npm run build
```

Point your MCP client at `dist/main-stdio.js` (use the Claude Desktop `node` + absolute path pattern documented in the root [README](../README.md#connect-to-claude-desktop-local-mode)).

## 5. Smoke test

In your MCP client, verify:

- **List tools** — expect ~42 tools total (12 deck/media/tag per-action tools + 17 essential + 11 GUI + 2 stats tools).
- **Sync** — call `sync`; expect a success response.
- **List decks** — call `listDecks`; expect `MCP Reviewer Demo` in the results.
- **Get a due card** — call `get_due_cards` with deck `MCP Reviewer Demo`.
- **Rate a card** — call `rate_card` on the returned card ID.

## 6. Exercise end-to-end flows (optional)

Three flows that cover breadth:

1. **Review session**: `sync` → `get_due_cards` → `present_card` → `rate_card` → `sync`
2. **Note creation**: `modelNames` → `addNote` (deck `MCP Reviewer Demo`)
3. **Tag management**: `getTags` → `addTags` on a note tagged `mcp-reviewer-demo`

## Troubleshooting

- **`sync` fails**: open Anki and log in to AnkiWeb manually once; subsequent syncs via the MCP server will reuse that session.
- **`localhost:8765` unreachable**: AnkiConnect didn't load. Re-check the add-on install (step 2) and confirm Anki is running.
- **Node.js version errors (`ERR_REQUIRE_ESM`, etc.)**: see the [Troubleshooting section](../README.md#err_require_esm-error) of the root README.

## Questions

- **Security issues**: report via [`SECURITY.md`](../SECURITY.md).
- **Everything else**: [GitHub Issues](https://github.com/ankimcp/anki-mcp-server/issues).
