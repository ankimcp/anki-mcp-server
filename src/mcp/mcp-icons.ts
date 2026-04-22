import type { Icon } from "@modelcontextprotocol/sdk/types.js";

/**
 * MCP-protocol icons advertised via the server's `Implementation.icons` field.
 *
 * Consumed by MCP clients (Claude Desktop, claude.ai, MCP Inspector) to render
 * a server identity in their UI. We advertise a single SVG hosted on the
 * project's marketing site — clients fetch it on demand, and the `"any"` size
 * declaration is the MCP spec convention for scalable vector formats.
 */
export const MCP_ICONS: Icon[] = [
  {
    src: "https://ankimcp.ai/favicon.svg",
    mimeType: "image/svg+xml",
    sizes: ["any"],
  },
];
