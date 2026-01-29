# Frequently Asked Questions

## anki-mcp-server vs anki-mcp-server-addon

### Which one should I use?

The addon is actually an MCP server itself — they're complementary, not mutually exclusive.

| Project | Runs in | Transport | Best for |
|---------|---------|-----------|----------|
| **anki-mcp-server** (this repo) | Node.js + AnkiConnect | STDIO, HTTP | Claude Desktop, Cursor, coding tools, remote access |
| **anki-mcp-server-addon** | Inside Anki (Python) | HTTP only | Simple setup, access to Anki internals |

**Why both exist:**

Partially historical, partially technical:

1. **Architecture** — All existing solutions I found were hard to extend and maintain (single "god file" anti-pattern). I wanted a modular architecture from day zero — each primitive (tool/resource/prompt) in its own file. Adding a new tool means adding one file.

2. **Technology stack** — My main stack is Node.js. Also, Anthropic requires Node.js for Claude Code's native extensions (MCPB bundles).

3. **HTTP mode** — Other solutions didn't support HTTP transport, which I needed to connect to Anki from anywhere (web-based AI assistants, remote access).

Later, I discovered that AnkiConnect doesn't expose some Anki internals (like the scheduler's review order). Also, installing the MCP server requires some technical background — users need to install Node.js, npm, configure packages, etc. So I decided to develop a native Python addon that runs inside Anki itself — just install the addon and you're ready to go.

### Why does the addon only support HTTP, not STDIO?

STDIO transport requires a separate executable that the MCP client spawns as a child process. The addon runs **inside** Anki's process — it can't be "spawned" by an MCP client.

| Transport | How it works |
|-----------|--------------|
| **STDIO** | MCP client **spawns** the server as a child process, communicates via stdin/stdout |
| **HTTP** | MCP client **connects** to an already-running server via HTTP |

To support STDIO in the addon, we'd need a bridge:

```
MCP Client ←(stdio)→ CLI Bridge ←(http)→ Python Addon (inside Anki)
```

That CLI bridge is essentially what the Node.js CLI already does with AnkiConnect. I may create such a CLI for the addon later, but for now they're two separate projects serving different use cases.

### Does the addon embed the server code?

No. They are completely separate codebases:

- **anki-mcp-server** — TypeScript/Node.js, uses AnkiConnect plugin
- **anki-mcp-server-addon** — Python, runs natively inside Anki

They share the same MCP tool names and API design for consistency, but no code is shared between them.

## Security & Permissions

### Can I configure read-only access?

<!-- TODO: Not yet implemented. This is a valid feature request. -->

## Integration

### Which MCP transport should I use (HTTP vs STDIO)?

**STDIO** is preferred for local coding tools (Claude Desktop, Cursor, Cline, Antigravity) because:
- No network exposure — STDIO communicates via process pipes, not TCP ports
- No firewall issues — HTTP servers can be blocked by corporate firewalls
- Simpler lifecycle — the client spawns and kills the server process automatically
- Easier debugging — no port conflicts, no "address already in use" errors

**HTTP** is needed for:
- Web-based AI assistants (ChatGPT, Claude.ai)
- Remote access scenarios
- The Python addon (it can only serve HTTP)

### Is HTTP good enough for coding tools like Antigravity?

Yes, HTTP works fine for local development. If your tool supports HTTP/SSE transport, both the Node.js server and the Python addon will work. The "preference" for STDIO is about security and simplicity, not capability.

### Does it work with Cursor/Cline/Antigravity?

Yes! Use STDIO mode:

```json
{
  "mcpServers": {
    "anki-mcp": {
      "command": "npx",
      "args": ["-y", "@ankimcp/anki-mcp-server", "--stdio"]
    }
  }
}
```

For the Python addon, use HTTP mode (check your tool's documentation for HTTP/SSE MCP configuration).
