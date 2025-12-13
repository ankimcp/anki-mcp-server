/**
 * Tunnel WebSocket Protocol Types
 * @see .claude-draft/tunnel-service/05-PROTOCOL.md
 */

/** Base message interface - all messages have a type field */
export interface TunnelMessage {
  type: string;
  [key: string]: unknown;
}

// ============================================================================
// Server → Client Messages
// ============================================================================

/** Sent immediately after successful WebSocket connection */
export interface TunnelEstablishedMessage extends TunnelMessage {
  type: "tunnel_established";
  url: string;
  expiresAt: string | null; // ISO datetime string, null for paid tier
}

/** Forwarded MCP request from LLM client */
export interface TunnelRequestMessage extends TunnelMessage {
  type: "request";
  requestId: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

/** Heartbeat ping - client must respond with pong */
export interface TunnelPingMessage extends TunnelMessage {
  type: "ping";
  timestamp: number;
}

/** Error notification (non-fatal) */
export interface TunnelErrorMessage extends TunnelMessage {
  type: "error";
  code: string;
  message: string;
  details?: unknown;
}

/** URL changed notification (slug update) */
export interface TunnelUrlChangedMessage extends TunnelMessage {
  type: "url_changed";
  oldUrl: string;
  newUrl: string;
}

/** Union type for all server messages */
export type ServerMessage =
  | TunnelEstablishedMessage
  | TunnelRequestMessage
  | TunnelPingMessage
  | TunnelErrorMessage
  | TunnelUrlChangedMessage;

// ============================================================================
// Client → Server Messages
// ============================================================================

/** Response to a forwarded request */
export interface TunnelResponseMessage extends TunnelMessage {
  type: "response";
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body?: unknown;
}

/** Response to ping (heartbeat) */
export interface TunnelPongMessage extends TunnelMessage {
  type: "pong";
  timestamp: number;
}

/** Union type for all client messages */
export type ClientMessage = TunnelResponseMessage | TunnelPongMessage;

// ============================================================================
// WebSocket Close Codes
// ============================================================================

export const TunnelCloseCodes = {
  NORMAL: 1000, // Normal closure
  GOING_AWAY: 1001, // Server shutdown
  UNAUTHORIZED: 4001, // Invalid token
  TOKEN_EXPIRED: 4002, // Token expired
  TUNNEL_LIMIT: 4003, // Tunnel limit exceeded
  TUNNEL_EXPIRED: 4004, // Free tier 24h limit
  ACCOUNT_SUSPENDED: 4005, // Account suspended
  SESSION_REPLACED: 4006, // Same token connected elsewhere
  CONNECTION_IN_PROGRESS: 4007, // Another connection is establishing
} as const;

export type TunnelCloseCode =
  (typeof TunnelCloseCodes)[keyof typeof TunnelCloseCodes];

// ============================================================================
// Default Configuration
// ============================================================================

export const TUNNEL_DEFAULTS = {
  URL: "ws://localhost:3004/tunnel",
  CONNECTION_TIMEOUT: 10000, // 10s
  REQUEST_TIMEOUT: 30000, // 30s
  HEARTBEAT_INTERVAL: 30000, // 30s
  HEARTBEAT_TIMEOUT: 10000, // 10s
  RECONNECT_INITIAL_DELAY: 1000, // 1s
  RECONNECT_MAX_DELAY: 30000, // 30s
  RECONNECT_MAX_ATTEMPTS: 10,
} as const;
