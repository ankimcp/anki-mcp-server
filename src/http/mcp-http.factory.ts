import { Controller, Type } from "@nestjs/common";
import { McpHttpControllerFor, StreamableHttpTransport } from "@rekog/mcp-nest";
import type { McpStrategy } from "@rekog/mcp-nest";
import { createMcpStrategy } from "@/bootstrap";
import type { AppConfig } from "@/config";

/**
 * MCP wiring for HTTP mode: the strategy the bootstrap connects as a
 * microservice, plus the controller that serves the MCP endpoint.
 */
export interface McpHttpServer {
  strategy: McpStrategy;
  controller: Type<object>;
}

/**
 * Builds the Streamable HTTP MCP endpoint as a controller we own.
 *
 * `mount: false` is stated rather than inferred. Left unset, the transport
 * decides by heuristic — it skips its own mount only because
 * `McpHttpControllerFor` happens to read `httpHandlers` while the controller
 * class is being defined. A self-mounted route is registered straight on the
 * HTTP adapter and bypasses the Nest pipeline, so the Origin/Host guards would
 * never run on it; that must not hinge on evaluation order.
 *
 * The path lives on `@Controller()` (root, matching the historical `mcpEndpoint`
 * of `/`) rather than on the transport, which ignores `endpoint` once a
 * controller owns the route.
 */
export function createMcpHttpServer(
  identity: AppConfig["mcpServer"],
): McpHttpServer {
  const transport = new StreamableHttpTransport({ mount: false });

  @Controller()
  class McpHttpController extends McpHttpControllerFor(transport) {}

  return {
    strategy: createMcpStrategy([transport], identity),
    controller: McpHttpController,
  };
}
