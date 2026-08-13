/**
 * Tunnel service exports
 * Provides OAuth Device Flow authentication and tunnel management
 */

export {
  DeviceFlowService,
  DeviceFlowError,
  type DeviceCodeResponse,
  type TokenResponse,
  type DeviceFlowErrorResponse,
} from "./device-flow.service";

export { CredentialsService } from "./credentials.service";
export type { TunnelCredentials } from "./credentials.service";

// Tunnel client
export {
  TunnelClient,
  TunnelClientError,
  type McpRequestHandler,
} from "./tunnel.client";

// MCP transport (passed to McpStrategy via `transports`)
export { TunnelTransport } from "./tunnel.transport";

// Protocol types
export * from "./tunnel.protocol";

// Command handlers
export { handleLogin, handleLogout, handleTunnel } from "./commands";
