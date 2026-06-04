import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ModuleRef, ContextIdFactory } from "@nestjs/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  McpExecutorService,
  McpRegistryDiscoveryService,
} from "@rekog/mcp-nest";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { InMemoryTransport } from "./in-memory.transport";
import type { ServerCapabilities } from "@modelcontextprotocol/sdk/types.js";
import { getVersion } from "../version";

/**
 * MCP service for tunnel mode using in-memory transport.
 * Provides direct MCP request handling without HTTP overhead.
 *
 * Based on StdioService pattern from @rekog/mcp-nest but uses
 * InMemoryTransport instead of StdioServerTransport.
 *
 * Note: MCP_MODULE_ID is retrieved dynamically from McpRegistryDiscoveryService
 * because it's not exported by McpModule (only available within McpModule scope).
 */
@Injectable()
export class TunnelMcpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TunnelMcpService.name);
  private mcpServer!: McpServer;
  private transport!: InMemoryTransport;
  private mcpModuleId!: string;

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly registry: McpRegistryDiscoveryService,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log("Bootstrapping MCP for tunnel mode...");

    // Get MCP module ID dynamically (can't inject it - not exported by McpModule)
    const moduleIds = this.registry.getMcpModuleIds();
    if (moduleIds.length === 0) {
      throw new Error("No MCP modules found - ensure McpModule is imported");
    }
    this.mcpModuleId = moduleIds[0];
    this.logger.debug(`Using MCP module ID: ${this.mcpModuleId}`);

    // Build capabilities from registered tools/prompts/resources
    const capabilities = this.buildMcpCapabilities();
    this.logger.debug("Built MCP capabilities:", capabilities);

    // Create MCP server with capabilities
    this.mcpServer = new McpServer(
      { name: "anki-mcp-server", version: getVersion() },
      { capabilities },
    );

    // Register request handlers
    const contextId = ContextIdFactory.create();
    const executor = await this.moduleRef.resolve(
      McpExecutorService,
      contextId,
      { strict: false },
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    executor.registerRequestHandlers(this.mcpServer, {} as any);

    // Connect in-memory transport
    this.transport = new InMemoryTransport();
    await this.mcpServer.connect(this.transport);

    this.logger.log("MCP tunnel service ready");
  }

  /**
   * Handle MCP request body (JSON string).
   * Handles a single JSON-RPC request. Array (batch) bodies are rejected with a
   * JSON-RPC -32600 error — batching was removed from the MCP spec in revision
   * 2025-06-18 and the Anki addon endpoint accepts single objects only.
   *
   * @param body - JSON string containing a single MCP request
   * @returns JSON string containing the MCP response, or empty string for notifications
   */
  async handleRequest(body: string): Promise<string> {
    let rawMessage: JSONRPCMessage | JSONRPCMessage[];
    try {
      rawMessage = JSON.parse(body);
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
      // and the Anki addon endpoint accepts single objects only. Reject arrays.
      return JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Invalid Request: JSON-RPC batching is not supported",
        },
      });
    }

    // Single request
    const response = await this.transport.handleRequest(rawMessage);
    return response ? JSON.stringify(response) : "";
  }

  /**
   * Build MCP capabilities from registry.
   * Inlined from @rekog/mcp-nest's buildMcpCapabilities utility (not exported).
   */
  private buildMcpCapabilities(): ServerCapabilities {
    const capabilities: ServerCapabilities = {};

    if (this.registry.getTools(this.mcpModuleId).length > 0) {
      capabilities.tools = {
        listChanged: true,
      };
    }

    if (
      this.registry.getResources(this.mcpModuleId).length > 0 ||
      this.registry.getResourceTemplates(this.mcpModuleId).length > 0
    ) {
      capabilities.resources = {
        listChanged: true,
      };
    }

    if (this.registry.getPrompts(this.mcpModuleId).length > 0) {
      capabilities.prompts = {
        listChanged: true,
      };
    }

    return capabilities;
  }
}
