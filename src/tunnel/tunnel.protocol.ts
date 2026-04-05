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

/**
 * WebSocket Close Codes
 * Aligned with SaaS WS_CLOSE_CODES (packages/shared-types/src/websocket.ts)
 */
export const TunnelCloseCodes = {
  /** Normal closure */
  NORMAL: 1000,
  /** Server shutting down */
  GOING_AWAY: 1001,
  /** Authentication failed or token invalid */
  AUTH_FAILED: 4001,
  /** User token was revoked (e.g., user clicked "Revoke Token" in dashboard) */
  TOKEN_REVOKED: 4002,
  /** Authentication failed during tunnel connection */
  TUNNEL_AUTH_FAILED: 4003,
  /** User account was deleted */
  ACCOUNT_DELETED: 4004,
  /** Another device/tab connected, this session is kicked */
  SESSION_REPLACED: 4005,
  /** Tunnel URL was regenerated */
  URL_REGENERATED: 4006,
  /** Service unavailable (e.g., SaaS API down) */
  SERVICE_UNAVAILABLE: 4008,
  /** Server shutting down gracefully */
  SHUTDOWN: 4009,
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
