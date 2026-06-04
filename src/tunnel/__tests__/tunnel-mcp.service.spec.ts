import { Test, TestingModule } from "@nestjs/testing";
import { ModuleRef } from "@nestjs/core";
import {
  McpRegistryDiscoveryService,
  McpExecutorService,
} from "@rekog/mcp-nest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { TunnelMcpService } from "../tunnel-mcp.service";
import { InMemoryTransport } from "../in-memory.transport";

// Mock InMemoryTransport
jest.mock("../in-memory.transport");

// Mock version to avoid hardcoding version strings in tests
jest.mock("../../version", () => ({
  getVersion: jest.fn().mockReturnValue("test-version"),
}));

// Mock McpServer
jest.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: jest.fn(),
}));

describe("TunnelMcpService", () => {
  let service: TunnelMcpService;
  let moduleRef: ModuleRef;
  let registry: McpRegistryDiscoveryService;
  let executor: McpExecutorService;
  let mockTransport: jest.Mocked<InMemoryTransport>;
  let mockMcpServer: jest.Mocked<McpServer>;

  const mockMcpModuleId = "test-mcp-module-id";

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create mock registry
    const mockRegistry = {
      getMcpModuleIds: jest.fn().mockReturnValue([mockMcpModuleId]),
      getTools: jest.fn().mockReturnValue([]),
      getResources: jest.fn().mockReturnValue([]),
      getResourceTemplates: jest.fn().mockReturnValue([]),
      getPrompts: jest.fn().mockReturnValue([]),
    };

    // Create mock executor
    const mockExecutor = {
      registerRequestHandlers: jest.fn(),
    };

    // Create mock module ref
    const mockModuleRef = {
      resolve: jest.fn().mockResolvedValue(mockExecutor),
    };

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TunnelMcpService,
        {
          provide: ModuleRef,
          useValue: mockModuleRef,
        },
        {
          provide: McpRegistryDiscoveryService,
          useValue: mockRegistry,
        },
      ],
    }).compile();

    service = module.get<TunnelMcpService>(TunnelMcpService);
    moduleRef = module.get<ModuleRef>(ModuleRef);
    registry = module.get<McpRegistryDiscoveryService>(
      McpRegistryDiscoveryService,
    );
    executor = mockExecutor as unknown as McpExecutorService;

    // Create mock transport instance
    mockTransport = {
      handleRequest: jest.fn(),
      onmessage: undefined,
      onclose: undefined,
      onerror: undefined,
      start: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<InMemoryTransport>;

    // Mock InMemoryTransport constructor
    (
      InMemoryTransport as jest.MockedClass<typeof InMemoryTransport>
    ).mockImplementation(() => mockTransport);

    // Create mock McpServer with connect method
    mockMcpServer = {
      connect: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<McpServer>;

    // Mock McpServer constructor
    (McpServer as jest.MockedClass<typeof McpServer>).mockImplementation(
      () => mockMcpServer,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("onApplicationBootstrap", () => {
    it("should initialize McpServer with correct server info", async () => {
      await service.onApplicationBootstrap();

      expect(McpServer).toHaveBeenCalledWith(
        { name: "anki-mcp-server", version: "test-version" },
        { capabilities: {} },
      );
    });

    it("should build capabilities with tools when registry has tools", async () => {
      const mockTools = [
        { name: "tool1", description: "Test tool 1" },
        { name: "tool2", description: "Test tool 2" },
      ];
      (registry.getTools as jest.Mock).mockReturnValue(mockTools);

      await service.onApplicationBootstrap();

      expect(registry.getTools).toHaveBeenCalledWith(mockMcpModuleId);
      expect(McpServer).toHaveBeenCalledWith(
        { name: "anki-mcp-server", version: "test-version" },
        {
          capabilities: {
            tools: { listChanged: true },
          },
        },
      );
    });

    it("should build capabilities with resources when registry has resources", async () => {
      const mockResources = [{ uri: "resource://test", name: "Test Resource" }];
      (registry.getResources as jest.Mock).mockReturnValue(mockResources);

      await service.onApplicationBootstrap();

      expect(registry.getResources).toHaveBeenCalledWith(mockMcpModuleId);
      expect(McpServer).toHaveBeenCalledWith(
        { name: "anki-mcp-server", version: "test-version" },
        {
          capabilities: {
            resources: { listChanged: true },
          },
        },
      );
    });

    it("should build capabilities with resources when registry has resource templates", async () => {
      const mockResourceTemplates = [
        { uriTemplate: "resource://{id}", name: "Test Template" },
      ];
      (registry.getResourceTemplates as jest.Mock).mockReturnValue(
        mockResourceTemplates,
      );

      await service.onApplicationBootstrap();

      expect(registry.getResourceTemplates).toHaveBeenCalledWith(
        mockMcpModuleId,
      );
      expect(McpServer).toHaveBeenCalledWith(
        { name: "anki-mcp-server", version: "test-version" },
        {
          capabilities: {
            resources: { listChanged: true },
          },
        },
      );
    });

    it("should build capabilities with prompts when registry has prompts", async () => {
      const mockPrompts = [{ name: "prompt1", description: "Test prompt 1" }];
      (registry.getPrompts as jest.Mock).mockReturnValue(mockPrompts);

      await service.onApplicationBootstrap();

      expect(registry.getPrompts).toHaveBeenCalledWith(mockMcpModuleId);
      expect(McpServer).toHaveBeenCalledWith(
        { name: "anki-mcp-server", version: "test-version" },
        {
          capabilities: {
            prompts: { listChanged: true },
          },
        },
      );
    });

    it("should build capabilities with all types when registry has all", async () => {
      (registry.getTools as jest.Mock).mockReturnValue([{ name: "tool1" }]);
      (registry.getResources as jest.Mock).mockReturnValue([
        { uri: "resource://test" },
      ]);
      (registry.getPrompts as jest.Mock).mockReturnValue([{ name: "prompt1" }]);

      await service.onApplicationBootstrap();

      expect(McpServer).toHaveBeenCalledWith(
        { name: "anki-mcp-server", version: "test-version" },
        {
          capabilities: {
            tools: { listChanged: true },
            resources: { listChanged: true },
            prompts: { listChanged: true },
          },
        },
      );
    });

    it("should resolve McpExecutorService from ModuleRef", async () => {
      await service.onApplicationBootstrap();

      expect(moduleRef.resolve).toHaveBeenCalledWith(
        McpExecutorService,
        expect.anything(), // contextId
        { strict: false },
      );
    });

    it("should register request handlers with McpExecutorService", async () => {
      await service.onApplicationBootstrap();

      expect(executor.registerRequestHandlers).toHaveBeenCalledWith(
        mockMcpServer,
        {},
      );
    });

    it("should create InMemoryTransport instance", async () => {
      await service.onApplicationBootstrap();

      expect(InMemoryTransport).toHaveBeenCalled();
    });

    it("should connect McpServer to InMemoryTransport", async () => {
      await service.onApplicationBootstrap();

      expect(mockMcpServer.connect).toHaveBeenCalledWith(mockTransport);
    });
  });

  describe("handleRequest - single request", () => {
    beforeEach(async () => {
      await service.onApplicationBootstrap();
    });

    it("should parse JSON request and return JSON response", async () => {
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

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(mockTransport.handleRequest).toHaveBeenCalledWith(request);
      expect(result).toBe(JSON.stringify(response));
    });

    it("should handle numeric request ids", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 42,
        method: "tools/list",
        params: {},
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 42,
        result: { tools: [] },
      };

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(result).toBe(JSON.stringify(response));
      expect(JSON.parse(result).id).toBe(42);
    });

    it("should handle string request ids", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: "request-uuid-123",
        method: "resources/list",
        params: {},
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: "request-uuid-123",
        result: { resources: [] },
      };

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(result).toBe(JSON.stringify(response));
      expect(JSON.parse(result).id).toBe("request-uuid-123");
    });

    it("should handle requests with complex params", async () => {
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

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(mockTransport.handleRequest).toHaveBeenCalledWith(request);
      expect(JSON.parse(result)).toEqual(response);
    });

    it("should handle error responses", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "invalid-tool" },
      };

      const errorResponse: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32601,
          message: "Method not found",
        },
      };

      mockTransport.handleRequest.mockResolvedValue(errorResponse);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result)).toEqual(errorResponse);
    });
  });

  describe("handleRequest - notifications", () => {
    beforeEach(async () => {
      await service.onApplicationBootstrap();
    });

    it("should return empty string for notification without id", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 123 },
      };

      mockTransport.handleRequest.mockResolvedValue(null);

      const result = await service.handleRequest(JSON.stringify(notification));

      expect(mockTransport.handleRequest).toHaveBeenCalledWith(notification);
      expect(result).toBe("");
    });

    it("should return empty string for notification with undefined id", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: undefined,
        method: "notifications/test",
        params: {},
      };

      mockTransport.handleRequest.mockResolvedValue(null);

      const result = await service.handleRequest(JSON.stringify(notification));

      expect(result).toBe("");
    });

    it("should handle notification with params", async () => {
      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { progress: 50, total: 100 },
      };

      mockTransport.handleRequest.mockResolvedValue(null);

      const result = await service.handleRequest(JSON.stringify(notification));

      expect(mockTransport.handleRequest).toHaveBeenCalledWith(notification);
      expect(result).toBe("");
    });
  });

  describe("handleRequest - batch request", () => {
    beforeEach(async () => {
      await service.onApplicationBootstrap();
    });

    it("rejects array (batch) bodies with a -32700 error", async () => {
      // JSON-RPC batching was removed from the MCP spec (2025-06-18) and the
      // Anki addon endpoint accepts single objects only — arrays are rejected.
      const batchRequest: JSONRPCMessage[] = [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: {},
        },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "resources/list",
          params: {},
        },
      ];

      const result = await service.handleRequest(JSON.stringify(batchRequest));

      expect(mockTransport.handleRequest).not.toHaveBeenCalled();
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

  describe("handleRequest - error handling", () => {
    beforeEach(async () => {
      await service.onApplicationBootstrap();
    });

    it("should return parse error for empty body", async () => {
      const result = await service.handleRequest("");

      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
          data: expect.stringContaining(""),
        },
      });
    });

    it("should return parse error for invalid JSON", async () => {
      const result = await service.handleRequest("{ invalid json }");

      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
          data: expect.any(String),
        },
      });
    });

    it("should return parse error for non-JSON string", async () => {
      const result = await service.handleRequest("not json");

      const parsedResult = JSON.parse(result);
      expect(parsedResult).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
          data: expect.any(String),
        },
      });
    });

    it("should propagate transport errors", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      };

      mockTransport.handleRequest.mockRejectedValue(
        new Error("Transport error"),
      );

      await expect(
        service.handleRequest(JSON.stringify(request)),
      ).rejects.toThrow("Transport error");
    });

    it("should handle transport timeout", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "slow-tool" },
      };

      mockTransport.handleRequest.mockRejectedValue(
        new Error("MCP request timeout"),
      );

      await expect(
        service.handleRequest(JSON.stringify(request)),
      ).rejects.toThrow("MCP request timeout");
    });
  });

  describe("edge cases", () => {
    beforeEach(async () => {
      await service.onApplicationBootstrap();
    });

    it("should handle request with null params", async () => {
      // Edge case: test pass-through of null params (not strictly valid per SDK types)
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

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(
        JSON.stringify(request as unknown as JSONRPCMessage),
      );

      expect(JSON.parse(result)).toEqual(response);
    });

    it("should handle request without params field", async () => {
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [] },
      };

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result)).toEqual(response);
    });

    it("should handle response with null result", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {},
      };

      // Edge case: test pass-through of null result (not strictly valid per SDK types)
      const response = {
        jsonrpc: "2.0" as const,
        id: 1,
        result: null,
      };

      mockTransport.handleRequest.mockResolvedValue(
        response as unknown as JSONRPCMessage,
      );

      const result = await service.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result).result).toBeNull();
    });

    it("should preserve response field order", async () => {
      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      };

      const response: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [], extra: "field" },
      };

      mockTransport.handleRequest.mockResolvedValue(response);

      const result = await service.handleRequest(JSON.stringify(request));

      expect(JSON.parse(result)).toEqual(response);
    });
  });
});
