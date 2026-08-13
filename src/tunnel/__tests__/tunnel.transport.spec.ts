import type { Logger } from "@nestjs/common";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import type { JSONRPCMessage, McpServer } from "@modelcontextprotocol/server";
import type { McpTransportContext } from "@rekog/mcp-nest";
import { InMemoryTransport } from "../in-memory.transport";
import { TunnelTransport } from "../tunnel.transport";

jest.mock("../in-memory.transport");

describe("TunnelTransport", () => {
  let transport: TunnelTransport;
  let mockChannel: jest.Mocked<InMemoryTransport>;
  let mockServer: jest.Mocked<McpServer>;
  let ctx: McpTransportContext;
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockChannel = {
      handleRequest: jest.fn(),
      start: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<InMemoryTransport>;

    (
      InMemoryTransport as jest.MockedClass<typeof InMemoryTransport>
    ).mockImplementation(() => mockChannel);

    mockServer = {
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<McpServer>;

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    ctx = {
      createServer: jest.fn().mockReturnValue(mockServer),
      bindRequestHandlers: jest.fn(),
      createBoundServer: jest.fn().mockReturnValue(mockServer),
      toolCallScopeDeficiency: jest.fn().mockReturnValue(undefined),
      options: {
        name: "anki-mcp-server",
        version: "test-version",
        transports: [],
      },
      logger,
    } as unknown as McpTransportContext;

    transport = new TunnelTransport();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("kind", () => {
    it("reports itself as a streamable-http transport", () => {
      // The closed McpTransportKind union has no tunnel member; a remote client
      // POSTing JSON-RPC bodies is streamable-http, not a local stdio process.
      expect(transport.kind).toBe("streamable-http");
    });
  });

  describe("start", () => {
    it("creates a bound server with a stateless legacy-era session seed", async () => {
      await transport.start(ctx);

      expect(ctx.createBoundServer).toHaveBeenCalledWith({
        transport: "streamable-http",
        stateless: true,
        era: "legacy",
      });
    });

    it("creates an InMemoryTransport channel", async () => {
      await transport.start(ctx);

      expect(InMemoryTransport).toHaveBeenCalledTimes(1);
    });

    it("connects the bound server to the channel", async () => {
      await transport.start(ctx);

      expect(mockServer.connect).toHaveBeenCalledWith(mockChannel);
    });

    it("logs startup through the context logger", async () => {
      await transport.start(ctx);

      expect(logger.log).toHaveBeenCalledWith("MCP tunnel transport started");
    });
  });

  describe("close", () => {
    it("closes both the channel and the bound server", async () => {
      await transport.start(ctx);
      await transport.close();

      expect(mockChannel.close).toHaveBeenCalled();
      expect(mockServer.close).toHaveBeenCalled();
    });

    it("is a no-op when the transport was never started", async () => {
      await expect(transport.close()).resolves.toBeUndefined();
      expect(mockChannel.close).not.toHaveBeenCalled();
    });

    it("leaves the transport unable to serve requests", async () => {
      await transport.start(ctx);
      await transport.close();

      await expect(transport.handleRequest("{}")).rejects.toThrow(
        "Tunnel transport not started",
      );
    });
  });

  describe("handleRequest - before start", () => {
    it("rejects requests until start() has run", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      };

      await expect(
        transport.handleRequest(JSON.stringify(request)),
      ).rejects.toThrow("Tunnel transport not started");
      expect(mockChannel.handleRequest).not.toHaveBeenCalled();
    });
  });

  describe("handleRequest - single request", () => {
    beforeEach(async () => {
      await transport.start(ctx);
    });

    it("parses the JSON body and returns the serialized response", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "sync" },
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      };

      mockChannel.handleRequest.mockResolvedValue(response);

      const result = await transport.handleRequest(JSON.stringify(request));

      expect(mockChannel.handleRequest).toHaveBeenCalledWith(request);
      expect(result).toBe(JSON.stringify(response));
    });

    it("handles numeric request ids", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 42,
        method: "tools/list",
        params: {},
      };

      mockChannel.handleRequest.mockResolvedValue({
        jsonrpc: "2.0",
        id: 42,
        result: { tools: [] },
      });

      const result = await transport.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result).id).toBe(42);
    });

    it("handles string request ids", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: "request-uuid-123",
        method: "resources/list",
        params: {},
      };

      mockChannel.handleRequest.mockResolvedValue({
        jsonrpc: "2.0",
        id: "request-uuid-123",
        result: { resources: [] },
      });

      const result = await transport.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result).id).toBe("request-uuid-123");
    });

    it("passes complex tool-call params through untouched", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "add-note",
          arguments: {
            deckName: "Default",
            modelName: "Basic",
            fields: { Front: "Question", Back: "Answer" },
          },
        },
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: "Note added: 123" }] },
      };

      mockChannel.handleRequest.mockResolvedValue(response);

      const result = await transport.handleRequest(JSON.stringify(request));

      expect(mockChannel.handleRequest).toHaveBeenCalledWith(request);
      expect(JSON.parse(result)).toEqual(response);
    });

    it("returns JSON-RPC error responses verbatim", async () => {
      const errorResponse: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32601,
          message: "Method not found",
        },
      };

      mockChannel.handleRequest.mockResolvedValue(errorResponse);

      const result = await transport.handleRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "invalid-tool" },
        }),
      );

      expect(JSON.parse(result)).toEqual(errorResponse);
    });
  });

  describe("handleRequest - notifications", () => {
    beforeEach(async () => {
      await transport.start(ctx);
    });

    it("returns an empty string for a notification without id", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 123 },
      };

      mockChannel.handleRequest.mockResolvedValue(null);

      const result = await transport.handleRequest(
        JSON.stringify(notification),
      );

      expect(mockChannel.handleRequest).toHaveBeenCalledWith(notification);
      expect(result).toBe("");
    });

    it("returns an empty string for a notification with an undefined id", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: undefined,
        method: "notifications/test",
        params: {},
      };

      mockChannel.handleRequest.mockResolvedValue(null);

      const result = await transport.handleRequest(
        JSON.stringify(notification),
      );

      expect(result).toBe("");
    });
  });

  describe("handleRequest - batch bodies", () => {
    beforeEach(async () => {
      await transport.start(ctx);
    });

    it("rejects array (batch) bodies with a -32700 error", async () => {
      // JSON-RPC batching was removed from the MCP spec (2025-06-18) and the
      // Anki addon endpoint accepts single objects only — arrays are rejected.
      const batchRequest: JSONRPCMessage[] = [
        { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
        { jsonrpc: "2.0", id: 2, method: "resources/list", params: {} },
      ];

      const result = await transport.handleRequest(
        JSON.stringify(batchRequest),
      );

      expect(mockChannel.handleRequest).not.toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Batched JSON-RPC requests are not supported",
        },
      });
    });
  });

  describe("handleRequest - modern-era clients", () => {
    // The per-request envelope a 2026-07-28 client opens with.
    const modernEnvelope = {
      [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
      [CLIENT_CAPABILITIES_META_KEY]: {},
      [CLIENT_INFO_META_KEY]: { name: "modern-client", version: "1.0.0" },
    };

    beforeEach(async () => {
      await transport.start(ctx);
    });

    it("answers a modern-era opener with an unsupported-protocol-version error", async () => {
      // This transport serves the 2025 handshake only, so the answer must name
      // the revisions it does serve rather than look like an unknown method.
      const result = await transport.handleRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "server/discover",
          params: { _meta: modernEnvelope },
        }),
      );

      const response = JSON.parse(result);
      expect(mockChannel.handleRequest).not.toHaveBeenCalled();
      expect(response.id).toBe(7);
      expect(response.error.code).toBe(-32022);
      expect(response.error.data.requested).toBe("2026-07-28");
      expect(response.error.data.supported).toContain("2025-06-18");
    });

    it("still serves 2025-era requests", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "legacy-client", version: "1.0.0" },
        },
      };

      mockChannel.handleRequest.mockResolvedValue({
        jsonrpc: "2.0",
        id: 1,
        result: {},
      });

      await transport.handleRequest(JSON.stringify(request));

      expect(mockChannel.handleRequest).toHaveBeenCalledWith(request);
    });
  });

  describe("handleRequest - error handling", () => {
    beforeEach(async () => {
      await transport.start(ctx);
    });

    it.each([
      ["empty body", ""],
      ["invalid JSON", "{ invalid json }"],
      ["non-JSON string", "not json"],
    ])("returns a parse error for %s", async (_label, body) => {
      const result = await transport.handleRequest(body);

      expect(mockChannel.handleRequest).not.toHaveBeenCalled();
      expect(JSON.parse(result)).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
          data: expect.any(String),
        },
      });
    });

    it("propagates channel errors", async () => {
      mockChannel.handleRequest.mockRejectedValue(new Error("Channel error"));

      await expect(
        transport.handleRequest(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
            params: {},
          }),
        ),
      ).rejects.toThrow("Channel error");
    });

    it("propagates request timeouts", async () => {
      mockChannel.handleRequest.mockRejectedValue(
        new Error("MCP request timeout"),
      );

      await expect(
        transport.handleRequest(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "slow-tool" },
          }),
        ),
      ).rejects.toThrow("MCP request timeout");
    });
  });

  describe("handleRequest - edge cases", () => {
    beforeEach(async () => {
      await transport.start(ctx);
    });

    it("passes through a request with null params", async () => {
      // Edge case: not strictly valid per SDK types, but must not be mangled.
      const request = {
        jsonrpc: "2.0" as const,
        id: 1,
        method: "tools/list",
        params: null,
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [] },
      };

      mockChannel.handleRequest.mockResolvedValue(response);

      const result = await transport.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result)).toEqual(response);
    });

    it("passes through a request without a params field", async () => {
      const request = { jsonrpc: "2.0", id: 1, method: "tools/list" };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [] },
      };

      mockChannel.handleRequest.mockResolvedValue(response);

      const result = await transport.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result)).toEqual(response);
    });

    it("serializes a null result rather than treating it as a notification", async () => {
      const response = { jsonrpc: "2.0" as const, id: 1, result: null };

      mockChannel.handleRequest.mockResolvedValue(
        response as unknown as JSONRPCMessage,
      );

      const result = await transport.handleRequest(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {},
        }),
      );

      expect(JSON.parse(result).result).toBeNull();
    });
  });
});
