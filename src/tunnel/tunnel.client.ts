import { EventEmitter } from "events";
import WebSocket from "ws";
import { Logger } from "@nestjs/common";
import {
  ServerMessage,
  TunnelEstablishedMessage,
  TunnelRequestMessage,
  TunnelPingMessage,
  TunnelErrorMessage,
  TunnelUrlChangedMessage,
  TunnelResponseMessage,
  TunnelPongMessage,
  TunnelCloseCodes,
  TUNNEL_DEFAULTS,
} from "./tunnel.protocol";
import { CredentialsService, TunnelCredentials } from "./credentials.service";
import { DeviceFlowService, DeviceFlowError } from "./device-flow.service";

/**
 * Handler interface for processing incoming MCP requests
 */
export interface McpRequestHandler {
  handle(request: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: string;
  }): Promise<{
    status: number;
    headers?: Record<string, string>;
    body: string;
  }>;
}

/**
 * Custom error class for tunnel client errors
 */
export class TunnelClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = "TunnelClientError";
  }
}

/**
 * WebSocket client for AnkiMCP tunnel service
 *
 * Events:
 * - 'connected': () => void - Tunnel established successfully
 * - 'disconnected': (code: number, reason: string) => void - WebSocket closed
 * - 'tunnel_url': (url: string) => void - Public tunnel URL received
 * - 'request': (requestId: string, request: TunnelRequestMessage) => void - MCP request received
 * - 'error': (error: Error) => void - Non-fatal error occurred
 * - 'expiring': (expiresAt: string, minutesRemaining: number) => void - Tunnel expiring soon
 *
 * @example
 * const client = new TunnelClient(mcpHandler, credentialsService, deviceFlowService);
 * client.on('tunnel_url', (url) => console.log('Tunnel URL:', url));
 * client.on('error', (err) => console.error('Tunnel error:', err));
 * const tunnelUrl = await client.connect();
 */
export class TunnelClient extends EventEmitter {
  private readonly logger = new Logger(TunnelClient.name);
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isManualDisconnect = false;
  private currentTunnelUrl: string | null = null;
  private credentials: TunnelCredentials | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly mcpHandler: McpRequestHandler,
    private readonly credentialsService: CredentialsService,
    private readonly deviceFlowService: DeviceFlowService,
    private readonly tunnelUrl: string = TUNNEL_DEFAULTS.URL,
  ) {
    super();
  }

  /**
   * Connect to tunnel server and establish tunnel
   * Returns the public tunnel URL once established
   *
   * @param providedTunnelUrl - Override default tunnel URL
   * @returns Public tunnel URL (e.g., https://abc123.tunnel.ankimcp.ai)
   * @throws {TunnelClientError} If connection fails or credentials invalid
   */
  async connect(providedTunnelUrl?: string): Promise<string> {
    if (this.isConnecting) {
      throw new TunnelClientError(
        "Connection already in progress",
        "connection_in_progress",
      );
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      throw new TunnelClientError("Already connected", "already_connected");
    }

    const url = providedTunnelUrl || this.tunnelUrl;
    this.isManualDisconnect = false;
    this.isConnecting = true;

    try {
      // Load credentials from storage
      this.credentials = await this.credentialsService.loadCredentials();
      if (!this.credentials) {
        throw new TunnelClientError(
          "No credentials found. Please run login first.",
          "no_credentials",
        );
      }

      // Check if token is expired and refresh if needed
      if (this.credentialsService.isTokenExpired(this.credentials)) {
        this.logger.log("Access token expired, refreshing...");
        await this.refreshTokenAndSave();
      }

      // Connect to WebSocket with access token
      const tunnelUrl = await this.establishConnection(url);
      this.reconnectAttempts = 0; // Reset on successful connection
      this.isConnecting = false;
      return tunnelUrl;
    } catch (error) {
      this.isConnecting = false;
      throw this.wrapError(error, "connect");
    }
  }

  /**
   * Disconnect from tunnel server
   * Stops reconnection attempts
   */
  disconnect(): void {
    this.logger.log("Disconnecting from tunnel (manual)");
    this.isManualDisconnect = true;
    this.clearReconnectTimer();
    this.clearConnectionTimeout();

    if (this.ws) {
      this.ws.close(TunnelCloseCodes.NORMAL, "Client disconnect");
      this.ws = null;
    }

    this.currentTunnelUrl = null;
  }

  /**
   * Check if currently connected to tunnel server
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get the current public tunnel URL
   */
  getTunnelUrl(): string | null {
    return this.currentTunnelUrl;
  }

  /**
   * Establish WebSocket connection with authentication
   * Returns public tunnel URL from tunnel_established message
   */
  private async establishConnection(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        return reject(
          new TunnelClientError("No credentials available", "no_credentials"),
        );
      }

      this.logger.log(`Connecting to tunnel server: ${url}`);

      // Create WebSocket with Authorization header
      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.credentials.access_token}`,
        },
      });

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.ws?.readyState !== WebSocket.OPEN) {
          this.ws?.terminate();
          reject(
            new TunnelClientError("Connection timeout", "connection_timeout"),
          );
        }
      }, TUNNEL_DEFAULTS.CONNECTION_TIMEOUT);

      // Handle connection open
      this.ws.once("open", () => {
        this.clearConnectionTimeout();
        this.logger.log("WebSocket connected, waiting for tunnel_established");
      });

      // Handle messages
      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as ServerMessage;

          // First message must be tunnel_established
          if (
            message.type === "tunnel_established" &&
            this.currentTunnelUrl === null
          ) {
            const establishedMsg = message as TunnelEstablishedMessage;
            this.currentTunnelUrl = establishedMsg.url;
            this.logger.log(`Tunnel established: ${establishedMsg.url}`);
            this.emit("connected");
            this.emit("tunnel_url", establishedMsg.url);
            resolve(establishedMsg.url);
          } else {
            this.handleMessage(message).catch((error) => {
              this.logger.error("Error handling message:", error);
              this.emit(
                "error",
                new TunnelClientError(
                  "Message handling failed",
                  "message_error",
                  error,
                ),
              );
            });
          }
        } catch (error) {
          this.logger.error("Failed to parse message:", error);
          this.emit(
            "error",
            new TunnelClientError(
              "Invalid message format",
              "parse_error",
              error,
            ),
          );
        }
      });

      // Handle connection close
      this.ws.on("close", (code: number, reason: Buffer) => {
        this.clearConnectionTimeout();
        const reasonStr = reason.toString();
        this.logger.log(`WebSocket closed: ${code} - ${reasonStr}`);

        this.currentTunnelUrl = null;
        this.emit("disconnected", code, reasonStr);

        // Handle reconnection based on close code
        if (!this.isManualDisconnect) {
          this.handleReconnection(code);
        }
      });

      // Handle WebSocket errors
      this.ws.on("error", (error: Error) => {
        this.logger.error("WebSocket error:", error);
        this.emit(
          "error",
          new TunnelClientError("WebSocket error", "websocket_error", error),
        );

        // If connection hasn't been established yet, reject
        if (this.currentTunnelUrl === null) {
          reject(
            new TunnelClientError(
              `Failed to connect: ${error.message}`,
              "connection_failed",
              error,
            ),
          );
        }
      });
    });
  }

  /**
   * Handle incoming messages from tunnel server
   */
  private async handleMessage(message: ServerMessage): Promise<void> {
    switch (message.type) {
      case "request":
        await this.handleRequest(message as TunnelRequestMessage);
        break;

      case "ping":
        this.handlePing(message as TunnelPingMessage);
        break;

      case "error":
        this.handleError(message as TunnelErrorMessage);
        break;

      case "url_changed":
        this.handleUrlChanged(message as TunnelUrlChangedMessage);
        break;

      default:
        this.logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle MCP request from LLM client
   * Forwards to handler and sends response back to server
   */
  private async handleRequest(message: TunnelRequestMessage): Promise<void> {
    this.logger.debug(
      `Handling request ${message.requestId}: ${message.method} ${message.path}`,
    );
    this.emit("request", message.requestId, message);

    try {
      // Convert body to string for handler (protocol allows unknown)
      const bodyStr =
        message.body === undefined
          ? ""
          : typeof message.body === "string"
            ? message.body
            : JSON.stringify(message.body);

      // Call MCP handler
      const response = await this.mcpHandler.handle({
        method: message.method,
        path: message.path,
        headers: message.headers,
        body: bodyStr,
      });

      // Send response back to server
      this.sendResponse({
        type: "response",
        requestId: message.requestId,
        statusCode: response.status,
        headers: response.headers || {},
        body: response.body,
      });
    } catch (error) {
      this.logger.error(`Error handling request ${message.requestId}:`, error);

      // Send error response
      this.sendResponse({
        type: "response",
        requestId: message.requestId,
        statusCode: 500,
        headers: {},
        body: JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : String(error),
        }),
      });
    }
  }

  /**
   * Handle heartbeat ping from server
   * Responds with pong to keep connection alive
   */
  private handlePing(message: TunnelPingMessage): void {
    this.logger.debug("Received ping, sending pong");
    this.sendPong({ type: "pong", timestamp: message.timestamp });
  }

  /**
   * Handle non-fatal error notification from server
   */
  private handleError(message: TunnelErrorMessage): void {
    this.logger.warn(`Server error: ${message.code} - ${message.message}`);
    this.emit("error", new TunnelClientError(message.message, message.code));
  }

  /**
   * Handle URL changed notification (slug update)
   */
  private handleUrlChanged(message: TunnelUrlChangedMessage): void {
    this.logger.log(
      `Tunnel URL changed: ${message.oldUrl} → ${message.newUrl}`,
    );
    this.currentTunnelUrl = message.newUrl;
    this.emit("url_changed", message.oldUrl, message.newUrl);
  }

  /**
   * Send response message to server
   * Wraps in NestJS WebSocket format: { event, data }
   */
  private sendResponse(message: TunnelResponseMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const wrapped = { event: "response", data: message };
      const payload = JSON.stringify(wrapped);
      this.ws.send(payload);
    } else {
      this.logger.error("Cannot send response: WebSocket not open");
    }
  }

  /**
   * Send pong message to server (heartbeat)
   * Wraps in NestJS WebSocket format: { event, data }
   */
  private sendPong(message: TunnelPongMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const wrapped = { event: "pong", data: message };
      this.ws.send(JSON.stringify(wrapped));
    } else {
      this.logger.error("Cannot send pong: WebSocket not open");
    }
  }

  /**
   * Handle reconnection logic based on close code
   * Implements exponential backoff with token refresh for auth errors
   */
  private handleReconnection(closeCode: number): void {
    // Check if we should attempt reconnection
    if (
      closeCode === TunnelCloseCodes.ACCOUNT_SUSPENDED ||
      closeCode === TunnelCloseCodes.TUNNEL_EXPIRED
    ) {
      this.logger.warn(`Not reconnecting: permanent close code ${closeCode}`);
      return;
    }

    if (this.reconnectAttempts >= TUNNEL_DEFAULTS.RECONNECT_MAX_ATTEMPTS) {
      this.logger.error(
        `Max reconnection attempts (${TUNNEL_DEFAULTS.RECONNECT_MAX_ATTEMPTS}) reached, giving up`,
      );
      this.emit(
        "error",
        new TunnelClientError(
          "Max reconnection attempts reached",
          "max_reconnect_attempts",
        ),
      );
      return;
    }

    // Calculate backoff delay (exponential with jitter)
    const baseDelay = TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY;
    const maxDelay = TUNNEL_DEFAULTS.RECONNECT_MAX_DELAY;
    const exponentialDelay = baseDelay * Math.pow(2, this.reconnectAttempts);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
    const delay = Math.min(exponentialDelay + jitter, maxDelay);

    this.reconnectAttempts++;
    this.logger.log(
      `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${TUNNEL_DEFAULTS.RECONNECT_MAX_ATTEMPTS})`,
    );

    // Handle auth errors - refresh token before reconnecting
    const isAuthError =
      closeCode === TunnelCloseCodes.UNAUTHORIZED ||
      closeCode === TunnelCloseCodes.TOKEN_EXPIRED;

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (isAuthError) {
          this.logger.log(
            "Auth error detected, refreshing token before reconnect",
          );
          await this.refreshTokenAndSave();
        }

        await this.connect();
      } catch (error) {
        this.logger.error("Reconnection failed:", error);
        this.emit(
          "error",
          new TunnelClientError(
            "Reconnection failed",
            "reconnect_failed",
            error,
          ),
        );
        // handleReconnection will be called again via close handler
      }
    }, delay);
  }

  /**
   * Refresh access token using refresh token and save to storage
   * Clears credentials if refresh fails (requires re-login)
   */
  private async refreshTokenAndSave(): Promise<void> {
    if (!this.credentials) {
      throw new TunnelClientError(
        "No credentials to refresh",
        "no_credentials",
      );
    }

    try {
      const tokenResponse = await this.deviceFlowService.refreshToken(
        this.credentials.refresh_token,
      );

      // Calculate new expiry time
      const expiresAt = new Date(
        Date.now() + tokenResponse.expires_in * 1000,
      ).toISOString();

      // Update credentials
      this.credentials = {
        ...this.credentials,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        expires_at: expiresAt,
      };

      // Save to storage
      await this.credentialsService.saveCredentials(this.credentials);
      this.logger.log("Access token refreshed and saved");
    } catch (error) {
      // If refresh fails (invalid/expired refresh token), clear credentials
      if (error instanceof DeviceFlowError && error.code === "invalid_grant") {
        this.logger.error(
          "Refresh token invalid/expired, clearing credentials",
        );
        await this.credentialsService.clearCredentials();
        this.credentials = null;
        throw new TunnelClientError(
          "Session expired. Please login again.",
          "session_expired",
          error,
        );
      }

      throw error;
    }
  }

  /**
   * Clear reconnection timer
   */
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Clear connection timeout
   */
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  /**
   * Wrap errors with TunnelClientError for consistent error handling
   */
  private wrapError(error: unknown, operation: string): TunnelClientError {
    if (error instanceof TunnelClientError) {
      return error;
    }

    if (error instanceof DeviceFlowError) {
      return new TunnelClientError(
        `${operation} failed: ${error.message}`,
        error.code,
        error,
      );
    }

    return new TunnelClientError(
      `${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
      "unknown_error",
      error,
    );
  }
}
