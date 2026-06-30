import { EventEmitter } from "events";
import WebSocket from "ws";
import { Logger } from "@nestjs/common";
import { HTTPError } from "ky";
import {
  ServerMessage,
  TunnelEstablishedMessage,
  TunnelRequestMessage,
  TunnelPingMessage,
  TunnelErrorMessage,
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
 * Internal `TunnelClientError.code` marking a pre-established auth failure: a
 * 4001/4003 close that arrives before `tunnel_established`. Produced by the
 * close handler and consumed by `isAuthFailure()` to trigger a single
 * refresh-and-retry. A single named constant keeps producer and consumer from
 * drifting apart.
 */
const PRE_ESTABLISHED_AUTH_FAILURE_CODE = "tunnel_auth_failed";

/**
 * WebSocket client for AnkiMCP tunnel service
 *
 * Events:
 * - 'connected': () => void - Tunnel established successfully
 * - 'disconnected': (code: number, reason: string, willReconnect: boolean) => void - WebSocket closed (willReconnect: client will auto-reconnect)
 * - 'tunnel_url': (url: string) => void - Public tunnel URL received
 * - 'request': (requestId: string, request: TunnelRequestMessage) => void - MCP request received
 * - 'error': (error: Error) => void - Non-fatal error occurred
 *
 * URL resolution: the constructor takes a required `tunnelUrl` argument which
 * is the single source of truth for this instance. The caller owns URL
 * resolution (env vars, CLI flags, schema default) — the client does NOT
 * re-resolve and does NOT carry its own fallback.
 *
 * @example
 * const client = new TunnelClient(mcpHandler, credentialsService, deviceFlowService, tunnelUrl);
 * client.on('tunnel_url', (url) => console.log('Tunnel URL:', url));
 * client.on('error', (err) => console.error('Tunnel error:', err));
 * const publicUrl = await client.connect();
 */
export class TunnelClient extends EventEmitter {
  private readonly logger = new Logger(TunnelClient.name);
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isManualDisconnect = false;
  // True only while a reconnect-timer-driven connect() is in flight. Lets the
  // close handler and establishWithAuthRetry distinguish a background reconnect
  // attempt from the first/CLI-driven connect(): the single-shot auth
  // refresh+retry and the "connect() owns the outcome" close-handler skip apply
  // to the first connect ONLY.
  private isReconnecting = false;
  private currentTunnelUrl: string | null = null;
  private credentials: TunnelCredentials | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private lastServerPingTime: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private pongTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly mcpHandler: McpRequestHandler,
    private readonly credentialsService: CredentialsService,
    private readonly deviceFlowService: DeviceFlowService,
    private readonly tunnelUrl: string,
  ) {
    super();
  }

  /**
   * Connect to tunnel server and establish tunnel.
   *
   * The tunnel URL is fixed at construction time — callers own URL resolution
   * and pass the resolved value to the constructor. This keeps a single
   * source of truth and lets the reconnect path call `connect()` with no
   * arguments without re-resolving anything.
   *
   * @param initialCredentials - Optional pre-loaded credentials. When provided,
   *   the client skips its own disk read for this connection attempt. The
   *   {@link CredentialsService} is still consulted for token refresh and for
   *   subsequent reconnects (which call `connect()` internally with no args).
   * @returns Public tunnel URL (e.g., https://abc123.tunnel.ankimcp.ai)
   * @throws {TunnelClientError} If connection fails or credentials invalid
   */
  async connect(initialCredentials?: TunnelCredentials): Promise<string> {
    if (this.isConnecting) {
      throw new TunnelClientError(
        "Connection already in progress",
        "connection_in_progress",
      );
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      throw new TunnelClientError("Already connected", "already_connected");
    }

    this.isManualDisconnect = false;
    this.isConnecting = true;

    try {
      // Use caller-provided credentials when available (avoids a redundant disk
      // read on the initial connect from the CLI). Reconnects and refresh
      // paths continue to use the credentials service as before.
      this.credentials =
        initialCredentials ?? (await this.credentialsService.loadCredentials());
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

      // Connect to WebSocket with access token using the instance's tunnel
      // URL. On the FIRST/CLI-driven connect, establishWithAuthRetry
      // transparently recovers from a SINGLE pre-established auth failure
      // (4001/4003) by refreshing the token once and retrying, so a
      // stale-but-refreshable access token no longer forces the user to
      // re-login. On reconnect-timer-driven connect()s it is a no-op passthrough
      // (handleReconnection already owns their token refresh).
      const tunnelUrl = await this.establishWithAuthRetry(this.tunnelUrl);
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
    this.stopHealthCheck();

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

      // Handle WebSocket-level pong (for health checks)
      this.ws.on("pong", () => this.handlePong());

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
            this.startHealthCheck();
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
        this.stopHealthCheck();
        const reasonStr = reason.toString();
        this.logger.log(`WebSocket closed: ${code} - ${reasonStr}`);

        // Capture the pre-established state BEFORE nulling currentTunnelUrl
        // below: it's the same signal the 'error' handler uses to tell whether
        // the in-flight establishConnection promise is still pending.
        const wasEstablished = this.currentTunnelUrl !== null;
        this.currentTunnelUrl = null;

        // Tell listeners whether this disconnect is recoverable so the CLI can
        // style it as a warning vs a terminal error. Mirrors the bail-out
        // conditions in handleReconnection().
        const willReconnect =
          !this.isManualDisconnect &&
          !this.isPermanentCloseCode(code) &&
          this.reconnectAttempts < TUNNEL_DEFAULTS.RECONNECT_MAX_ATTEMPTS;
        this.emit("disconnected", code, reasonStr, willReconnect);

        // An auth failure (4001/4003) surfaces AFTER `open` as a 'close', not
        // an 'error'. Detect it up front so a *pre-established* occurrence on the
        // first/CLI connect can be routed through connect()'s single-shot
        // refresh-and-retry rather than a hard failure.
        const isAuthClose =
          code === TunnelCloseCodes.AUTH_FAILED ||
          code === TunnelCloseCodes.TUNNEL_AUTH_FAILED;

        // A close that arrives BEFORE the tunnel is established (e.g. an
        // application-level 4003 TUNNEL_AUTH_FAILED, which fires AFTER `open`
        // and surfaces as a 'close' rather than an 'error') must reject the
        // pending establishConnection promise — mirroring the pre-established
        // branch of the 'error' handler. Without this the promise never
        // settles, connect() never returns, and its `isConnecting` guard stays
        // latched true, wedging the client permanently. An auth failure rejects
        // with the dedicated PRE_ESTABLISHED_AUTH_FAILURE_CODE so
        // establishWithAuthRetry can recognise it and refresh once; every other
        // pre-established close rejects with "connection_closed" and fails fast
        // (no refresh). Rejecting an already-settled promise (e.g. the
        // connection-timeout path beat us here) is a no-op, so this is safe.
        if (!wasEstablished) {
          reject(
            new TunnelClientError(
              `Connection closed before tunnel established (code ${code})${
                reasonStr ? `: ${reasonStr}` : ""
              }`,
              isAuthClose
                ? PRE_ESTABLISHED_AUTH_FAILURE_CODE
                : "connection_closed",
            ),
          );
        }

        // Handle reconnection based on close code.
        //
        // A pre-established close during the FIRST/CLI connect is deliberately
        // NOT routed here: that in-flight connect() owns the outcome — it was
        // rejected above, and for auth closes it is recovered via
        // establishWithAuthRetry's single-shot refresh+retry. Scheduling a
        // parallel background reconnect would race connect() and the user-facing
        // CLI error. A pre-established close during a RECONNECT attempt, by
        // contrast, MUST flow through handleReconnection so the backoff loop
        // survives to the next attempt. Every established drop (wasEstablished
        // === true, including mid-session auth failures) also flows through
        // unchanged. Keying the skip off "first connect" (not "auth") means a
        // non-auth first-connect close also stays owned by connect() — nothing
        // schedules a parallel reconnect behind it.
        const isFirstConnectPreEstablish =
          !wasEstablished && !this.isReconnecting;
        if (!this.isManualDisconnect && !isFirstConnectPreEstablish) {
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
   * Establish the tunnel for the FIRST/CLI-driven connect(), transparently
   * recovering from a SINGLE pre-established auth failure.
   *
   * Reconnect-timer-driven connect()s skip this recovery entirely (plain
   * establishConnection): handleReconnection() already refreshes the token for
   * auth close codes before each reconnect, so retrying here too would
   * double-refresh and fight the backoff loop. The `isReconnecting` flag makes
   * this a no-op passthrough during reconnects.
   *
   * On the first connect, a 4001/4003 close that arrives before
   * `tunnel_established` rejects establishConnection() with
   * PRE_ESTABLISHED_AUTH_FAILURE_CODE. The stored access_token may simply be
   * stale (expired or rotated server-side) while the refresh_token is still
   * valid, so we refresh ONCE and retry — making the same recovery
   * handleReconnection() performs mid-session available on the very first
   * connect(), instead of forcing the user to re-login.
   *
   * Single-shot guard: there is no loop, so genuinely dead credentials fail fast
   * rather than refreshing forever. A non-auth close, or a close after a manual
   * disconnect, is rethrown untouched (fail fast, no refresh). If the retry
   * STILL auth-closes, a freshly refreshed token was rejected — re-login is the
   * real fix, so it is surfaced as "session_expired" (which the CLI maps to
   * re-login guidance) rather than a generic connection error.
   */
  private async establishWithAuthRetry(url: string): Promise<string> {
    // Reconnect attempts own their own token refresh (handleReconnection); a
    // second refresh+retry here would double-refresh and truncate the backoff
    // loop, so a reconnect-driven connect() just establishes plainly.
    if (this.isReconnecting) {
      return this.establishConnection(url);
    }

    try {
      return await this.establishConnection(url);
    } catch (error) {
      if (!this.isAuthFailure(error) || this.isManualDisconnect) {
        throw error;
      }

      this.logger.log(
        "Auth failed before tunnel established — refreshing token and retrying once",
      );
      // Reuses the SAME refresh helper as handleReconnection (no duplicated
      // refresh/device-flow code). Throws TunnelClientError("session_expired")
      // when the refresh_token is dead, which the CLI surfaces as a re-login.
      await this.refreshTokenAndSave();

      // A manual disconnect may have landed during the refresh await; if so,
      // bail instead of opening a fresh socket the user just asked us to drop.
      if (this.isManualDisconnect) {
        throw error;
      }

      // Single retry — intentionally NOT wrapped in another auth-retry, so we
      // never loop on dead credentials.
      try {
        return await this.establishConnection(url);
      } catch (retryError) {
        // A freshly refreshed token still auth-closed => re-login is the real
        // fix. Surface it with the existing session_expired code/copy the CLI
        // already maps to re-login guidance, instead of a generic
        // "Failed to connect (4003)".
        if (this.isAuthFailure(retryError)) {
          throw new TunnelClientError(
            "Session expired. Please run `ankimcp --login` to re-authenticate.",
            "session_expired",
            retryError,
          );
        }
        throw retryError;
      }
    }
  }

  /**
   * Whether an error is a pre-established auth failure (4001/4003) surfaced by
   * the close handler as a rejected establishConnection(). Drives the decision
   * to attempt a single refresh-and-retry in establishWithAuthRetry().
   */
  private isAuthFailure(error: unknown): boolean {
    return (
      error instanceof TunnelClientError &&
      error.code === PRE_ESTABLISHED_AUTH_FAILURE_CODE
    );
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
      // Body is always a string per protocol (z.string().optional())
      const bodyStr = message.body ?? "";

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

      const {
        status,
        code,
        message: errorMessage,
      } = this.mapHandlerError(error);

      // Mirror the relay's JSON-RPC error contract so the end MCP client sees
      // one consistent error envelope regardless of which side failed.
      this.sendResponse({
        type: "response",
        requestId: message.requestId,
        statusCode: status,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code, message: errorMessage },
        }),
      });
    }
  }

  /**
   * Map a request-handler error onto the relay's JSON-RPC error contract
   * (timeout → 504/-32004, connection unavailable → 503/-32005, otherwise
   * 500/-32006), so the end MCP client sees one consistent error envelope no
   * matter which side generated it. Mirrors the relay's sendJsonRpcError.
   */
  private mapHandlerError(error: unknown): {
    status: number;
    code: number;
    message: string;
  } {
    const raw = error instanceof Error ? error.message : String(error);

    if (/timeout/i.test(raw)) {
      return { status: 504, code: -32004, message: "Request to CLI timed out" };
    }
    if (/closed|not connected/i.test(raw)) {
      return {
        status: 503,
        code: -32005,
        message: "Tunnel connection is not available",
      };
    }
    return {
      status: 500,
      code: -32006,
      message: "Failed to forward request to CLI",
    };
  }

  /**
   * Handle heartbeat ping from server
   * Responds with pong to keep connection alive
   */
  private handlePing(message: TunnelPingMessage): void {
    this.lastServerPingTime = Date.now();
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
   * Send response message to server
   */
  private sendResponse(message: TunnelResponseMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.logger.error("Cannot send response: WebSocket not open");
    }
  }

  /**
   * Send pong message to server (heartbeat)
   */
  private sendPong(message: TunnelPongMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.logger.error("Cannot send pong: WebSocket not open");
    }
  }

  /**
   * Close codes after which the client will NOT auto-reconnect: a normal/manual
   * close, a deleted account, a replaced session, or a revoked token. Single
   * source of truth for the no-reconnect decision — both handleReconnection()
   * and the 'disconnected' event's willReconnect flag derive from it.
   */
  private isPermanentCloseCode(code: number): boolean {
    return (
      code === TunnelCloseCodes.NORMAL ||
      code === TunnelCloseCodes.ACCOUNT_DELETED ||
      code === TunnelCloseCodes.SESSION_REPLACED ||
      code === TunnelCloseCodes.TOKEN_REVOKED
    );
  }

  /**
   * Handle reconnection logic based on close code
   * Implements exponential backoff with token refresh for auth errors
   */
  private handleReconnection(closeCode: number): void {
    this.clearReconnectTimer();

    // Permanent close codes — do not reconnect. isPermanentCloseCode() is the
    // single source of truth for this decision (it also drives the
    // 'disconnected' event's willReconnect flag); the per-code messaging lives
    // in the switch below.
    if (this.isPermanentCloseCode(closeCode)) {
      switch (closeCode) {
        case TunnelCloseCodes.ACCOUNT_DELETED:
          this.logger.warn("Account deleted, not reconnecting");
          break;
        case TunnelCloseCodes.SESSION_REPLACED:
          this.logger.warn(
            "Disconnected: another device connected. Run `ankimcp --tunnel` to reconnect.",
          );
          break;
        case TunnelCloseCodes.TOKEN_REVOKED:
          // User deliberately revoked — require re-login.
          this.emit(
            "error",
            new TunnelClientError(
              "Token was revoked. Please run `ankimcp --login` to re-authenticate.",
              "session_expired",
            ),
          );
          break;
        default: // NORMAL
          this.logger.log("Normal closure, not reconnecting");
      }
      return;
    }

    // Max attempts check
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
    const jitter = Math.random() * 0.3 * exponentialDelay;
    const delay = Math.min(exponentialDelay + jitter, maxDelay);

    this.reconnectAttempts++;
    this.logger.log(
      `Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts}/${TUNNEL_DEFAULTS.RECONNECT_MAX_ATTEMPTS})`,
    );

    // Auth errors — refresh token before reconnecting
    const isAuthError =
      closeCode === TunnelCloseCodes.AUTH_FAILED ||
      closeCode === TunnelCloseCodes.TUNNEL_AUTH_FAILED;

    this.reconnectTimer = setTimeout(async () => {
      // Mark this connect() as reconnect-driven so (a) the close handler keeps
      // the backoff loop alive on a pre-established close instead of letting
      // connect() own it, and (b) establishWithAuthRetry skips its
      // first-connect-only refresh+retry (we already refreshed above for auth
      // codes). Reset in `finally` so a later established drop is treated as a
      // fresh first-connect again.
      this.isReconnecting = true;
      try {
        if (isAuthError) {
          this.logger.log(
            "Auth error detected, refreshing token before reconnect",
          );
          await this.refreshTokenAndSave();
        }

        // Reconnects intentionally call connect() with no initial credentials —
        // we want to pick up the latest persisted state from disk (especially
        // after refreshTokenAndSave has just updated it). The instance's
        // tunnelUrl remains the single source of truth.
        await this.connect();
      } catch (error) {
        this.logger.error("Reconnection failed:", error);

        // Don't wrap session_expired errors - emit them directly
        if (
          error instanceof TunnelClientError &&
          error.code === "session_expired"
        ) {
          this.emit("error", error);
        } else {
          this.emit(
            "error",
            new TunnelClientError(
              "Reconnection failed",
              "reconnect_failed",
              error,
            ),
          );
        }
        // The next backoff attempt is rescheduled by the close handler: this is
        // a reconnect attempt (isReconnecting === true), so a pre-established
        // close still routes through handleReconnection. If connect() failed
        // before any socket opened (e.g. the pre-reconnect refresh threw), no
        // close fires and the loop ends here — intended for unrecoverable auth
        // errors.
      } finally {
        this.isReconnecting = false;
      }
    }, delay);
  }

  /**
   * Start periodic health checks for connection liveness
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.lastServerPingTime = Date.now();

    this.healthCheckInterval = setInterval(() => {
      this.checkConnectionHealth();
    }, TUNNEL_DEFAULTS.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop health check interval and clear pong timeout
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  /**
   * Check connection health using both passive and active methods
   * Passive: Check if server has been silent too long
   * Active: Send WebSocket ping and expect pong response
   */
  private checkConnectionHealth(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    const timeSinceServerPing = Date.now() - this.lastServerPingTime;
    const maxSilence = TUNNEL_DEFAULTS.HEARTBEAT_INTERVAL * 2; // 60s

    // PASSIVE CHECK: Has server been silent too long?
    if (timeSinceServerPing > maxSilence) {
      this.logger.error(
        `Connection appears dead: no server ping in ${Math.round(timeSinceServerPing / 1000)}s`,
      );
      this.ws.terminate();
      return;
    }

    // ACTIVE CHECK: Send WebSocket-level ping and expect pong
    this.logger.debug("Sending health check ping");
    this.ws.ping();

    // Clear any existing pong timeout
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
    }

    // Set timeout for pong response
    this.pongTimeout = setTimeout(() => {
      this.logger.error(
        `Connection dead: no pong received in ${TUNNEL_DEFAULTS.HEARTBEAT_TIMEOUT}ms`,
      );
      this.ws?.terminate();
    }, TUNNEL_DEFAULTS.HEARTBEAT_TIMEOUT);
  }

  /**
   * Handle pong response from WebSocket-level ping
   */
  private handlePong(): void {
    this.logger.debug("Received pong (health check)");
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
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
      // Any error during token refresh means we need to re-authenticate
      // This includes: invalid_grant, http_error, auth_failed, server_error, etc.
      if (error instanceof DeviceFlowError || error instanceof HTTPError) {
        throw new TunnelClientError(
          "Session expired. Please run `ankimcp --login` to re-authenticate.",
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
