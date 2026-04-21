import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Icon } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP-protocol icons advertised via the server's `Implementation.icons` field.
 *
 * These are consumed by MCP clients (Claude Desktop, claude.ai, MCP Inspector)
 * to render a server identity in their UI. The MCP spec requires the icon
 * `src` to be resolvable by the client — we inline PNGs as `data:` URIs so
 * STDIO clients (which have no HTTP surface) can render them without needing
 * to fetch from a network location.
 *
 * Icons are read from disk once, synchronously, at module load. The assets
 * are copied to `dist/assets/mcp/` by `nest-cli.json`, so `__dirname` lookup
 * works identically in dev (`nest start --watch`) and production.
 */

const ASSETS_DIR = join(__dirname, "..", "assets", "mcp");

function loadIcon(filename: string, sizes: string[]): Icon {
  const absolutePath = join(ASSETS_DIR, filename);
  const buffer = readFileSync(absolutePath);
  const base64 = buffer.toString("base64");
  return {
    src: `data:image/png;base64,${base64}`,
    mimeType: "image/png",
    sizes,
  };
}

export const MCP_ICONS: Icon[] = [
  loadIcon("mcp-icon-48.png", ["48x48"]),
  loadIcon("mcp-icon-96.png", ["96x96"]),
];
