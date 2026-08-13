import {
  classifyInboundRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
  UnsupportedProtocolVersionError,
} from "@modelcontextprotocol/server";
import type { JSONRPCMessage, McpServer } from "@modelcontextprotocol/server";
import type { McpTransport, McpTransportContext } from "@rekog/mcp-nest";
import { InMemoryTransport } from "./in-memory.transport";

/**
 * MCP transport for tunnel mode.
 *
 * The tunnel relay hands us complete HTTP-shaped request bodies over its
 * WebSocket and expects exactly one response body back, so this transport owns
 * a single long-lived MCP server bound to an {@link InMemoryTransport} channel
 * and feeds relayed bodies into it via {@link handleRequest}.
 *
 * `kind` is `streamable-http`: the closed `McpTransportKind` union has no tunnel
 * member, and a remote client POSTing JSON-RPC bodies is what this actually is —
 * claiming `stdio` would tell handlers the caller is a local process.
 */
export class TunnelTransport implements McpTransport {
  readonly kind = "streamable-http" as const;

  private server?: McpServer;
  private channel?: InMemoryTransport;

  start(ctx: McpTransportContext): Promise<void> {
    this.channel = new InMemoryTransport();
    // One bound server for the process: the relay authenticates the tunnel
    // itself, so there is no per-request auth context to re-bind against.
    //
    // `stateless: true` because the channel resolves one response per request id
    // and drops everything else — progress and logging have nowhere to go, and
    // this makes handlers warn instead of writing into a black hole.
    //
    // `era: 'legacy'`: a hand-connected McpServer serves the 2025 `initialize`
    // handshake, which is what the tunnel's remote clients speak.
    this.server = ctx.createBoundServer({
      transport: this.kind,
      stateless: true,
      era: "legacy",
    });

    ctx.logger.log("MCP tunnel transport started");
    return this.server.connect(this.channel);
  }

  async close(): Promise<void> {
    await this.channel?.close();
    await this.server?.close();
    this.channel = undefined;
    this.server = undefined;
  }

  /**
   * Handle MCP request body (JSON string).
   * Handles a single JSON-RPC request. Array (batch) bodies are rejected with a
   * JSON-RPC -32700 error — batching was removed from the MCP spec in revision
   * 2025-06-18 and the Anki addon endpoint accepts single objects only.
   *
   * @param body - JSON string containing a single MCP request
   * @returns JSON string containing the MCP response, or empty string for notifications
   */
  async handleRequest(body: string): Promise<string> {
    if (!this.channel) {
      throw new Error("Tunnel transport not started");
    }

    let rawMessage: JSONRPCMessage | JSONRPCMessage[];
    try {
      rawMessage = JSON.parse(body) as JSONRPCMessage | JSONRPCMessage[];
    } catch (error) {
      return JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
          data: error instanceof Error ? error.message : String(error),
        },
      });
    }

    if (Array.isArray(rawMessage)) {
      // JSON-RPC batching was removed from the MCP spec (revision 2025-06-18)
      // and the Anki addon endpoint accepts single objects only. Reject arrays
      // with the same -32700 code/message the relay uses for batch bodies.
      return JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Batched JSON-RPC requests are not supported",
        },
      });
    }

    // This path is legacy-era only (see `start`), unlike STDIO and HTTP which
    // serve both. Answer a modern-era opener the way the framework's era-limited
    // transports do — an unsupported-protocol-version error naming the revisions
    // that ARE served — instead of the bare -32601 an unknown method would get.
    // Modern notifications fall through: there is no id to answer on.
    const inbound = classifyInboundRequest({
      httpMethod: "POST",
      body: rawMessage,
    });
    if (inbound.kind === "modern" && inbound.messageKind === "request") {
      const error = new UnsupportedProtocolVersionError({
        supported: [...SUPPORTED_PROTOCOL_VERSIONS],
        requested: inbound.classification.revision ?? "unknown",
      });
      return JSON.stringify({
        jsonrpc: "2.0",
        id: inbound.message.id,
        error: { code: error.code, message: error.message, data: error.data },
      });
    }

    // Single request
    const response = await this.channel.handleRequest(rawMessage);
    return response ? JSON.stringify(response) : "";
  }
}
