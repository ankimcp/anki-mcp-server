import { EventEmitter } from "events";
import WebSocket from "ws";
import { TunnelClient, McpRequestHandler } from "../tunnel.client";
import { CredentialsService, TunnelCredentials } from "../credentials.service";
import {
  DeviceFlowService,
  DeviceFlowError,
  TokenResponse,
} from "../device-flow.service";
import { TunnelCloseCodes, TUNNEL_DEFAULTS } from "../tunnel.protocol";

// Mock WebSocket
jest.mock("ws");

const TEST_TUNNEL_URL = "wss://test.example/tunnel";

describe("TunnelClient", () => {
  let mockMcpHandler: jest.Mocked<McpRequestHandler>;
  let mockCredentialsService: jest.Mocked<CredentialsService>;
  let mockDeviceFlowService: jest.Mocked<DeviceFlowService>;
  let client: TunnelClient;
  let mockWs: jest.Mocked<WebSocket>;

  const mockCredentials: TunnelCredentials = {
    access_token: "mock_access_token",
    refresh_token: "mock_refresh_token",
    expires_at: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
    user: {
      id: "user123",
      email: "test@example.com",
      tier: "free",
    },
  };

  const mockTokenResponse: TokenResponse = {
    user: { id: "user123", email: "test@example.com", tier: "free" },
    access_token: "new_access_token",
    refresh_token: "new_refresh_token",
    expires_in: 3600,
    token_type: "Bearer",
  };

  function createMockWs(): jest.Mocked<WebSocket> {
    const ws = new EventEmitter() as any;
    Object.defineProperty(ws, "readyState", {
      value: WebSocket.CONNECTING,
      writable: true,
      configurable: true,
    });
    ws.send = jest.fn();
    ws.close = jest.fn();
    ws.terminate = jest.fn();
    ws.ping = jest.fn();
    return ws;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MCP handler
    mockMcpHandler = {
      handle: jest.fn().mockResolvedValue({
        status: 200,
        body: JSON.stringify({ result: "ok" }),
      }),
    };

    // Mock CredentialsService
    mockCredentialsService = {
      loadCredentials: jest.fn().mockResolvedValue(mockCredentials),
      saveCredentials: jest.fn().mockResolvedValue(undefined),
      clearCredentials: jest.fn().mockResolvedValue(undefined),
      isTokenExpired: jest.fn().mockReturnValue(false),
      hasCredentials: jest.fn().mockResolvedValue(true),
      getCredentialsPath: jest
        .fn()
        .mockReturnValue("~/.ankimcp/credentials.json"),
    } as any;

    // Mock DeviceFlowService
    mockDeviceFlowService = {
      refreshToken: jest.fn().mockResolvedValue(mockTokenResponse),
    } as any;

    // Mock WebSocket instance
    mockWs = createMockWs();

    // Mock WebSocket constructor
    (WebSocket as any).mockImplementation(() => mockWs);
    (WebSocket as any).OPEN = 1;
    (WebSocket as any).CONNECTING = 0;
    (WebSocket as any).CLOSING = 2;
    (WebSocket as any).CLOSED = 3;

    client = new TunnelClient(
      mockMcpHandler,
      mockCredentialsService,
      mockDeviceFlowService,
      TEST_TUNNEL_URL,
    );
  });

  afterEach(() => {
    client.disconnect();
  });

  describe("connect", () => {
    it("should connect successfully and return tunnel URL", async () => {
      const connectPromise = client.connect();

      // Simulate WebSocket open
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");

      // Simulate tunnel_established message
      const tunnelUrl = "https://abc123.tunnel.ankimcp.ai";
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: tunnelUrl,
        }),
      );

      const result = await connectPromise;

      expect(result).toBe(tunnelUrl);
      expect(mockCredentialsService.loadCredentials).toHaveBeenCalled();
      expect(WebSocket).toHaveBeenCalledWith(
        TEST_TUNNEL_URL,
        expect.objectContaining({
          headers: {
            Authorization: "Bearer mock_access_token",
          },
        }),
      );
    });

    it("should throw error if no credentials found", async () => {
      mockCredentialsService.loadCredentials.mockResolvedValue(null);

      await expect(client.connect()).rejects.toThrow(
        expect.objectContaining({
          code: "no_credentials",
        }),
      );
    });

    it("should refresh token if expired before connecting", async () => {
      mockCredentialsService.isTokenExpired.mockReturnValue(true);

      const connectPromise = client.connect();

      // Wait for refresh to complete
      await new Promise((resolve) => setImmediate(resolve));

      // Simulate WebSocket open
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");

      // Simulate tunnel_established message
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://abc123.tunnel.ankimcp.ai",
        }),
      );

      await connectPromise;

      expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledWith(
        "mock_refresh_token",
      );
      expect(mockCredentialsService.saveCredentials).toHaveBeenCalled();
    }, 10000);

    it("should emit connected and tunnel_url events", async () => {
      const connectedSpy = jest.fn();
      const tunnelUrlSpy = jest.fn();
      client.on("connected", connectedSpy);
      client.on("tunnel_url", tunnelUrlSpy);

      const connectPromise = client.connect();

      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");

      const tunnelUrl = "https://abc123.tunnel.ankimcp.ai";
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: tunnelUrl,
        }),
      );

      await connectPromise;

      expect(connectedSpy).toHaveBeenCalled();
      expect(tunnelUrlSpy).toHaveBeenCalledWith(tunnelUrl);
    });

    it("should handle WebSocket error during connection", async () => {
      // Listen for error events to prevent unhandled error
      const errorSpy = jest.fn();
      client.on("error", errorSpy);

      const connectPromise = client.connect();

      await Promise.resolve();
      mockWs.emit("error", new Error("Connection refused"));

      await expect(connectPromise).rejects.toThrow(
        expect.objectContaining({
          code: "connection_failed",
        }),
      );

      // Error event should have been emitted
      expect(errorSpy).toHaveBeenCalled();
    });

    it("uses caller-supplied credentials and skips the disk read", async () => {
      const callerCreds: TunnelCredentials = {
        ...mockCredentials,
        access_token: "caller_supplied_token",
      };

      const connectPromise = client.connect(callerCreds);

      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://abc123.tunnel.ankimcp.ai",
        }),
      );
      await connectPromise;

      // Disk read skipped — caller already provided creds.
      expect(mockCredentialsService.loadCredentials).not.toHaveBeenCalled();
      // The supplied access token is what we authed with.
      expect(WebSocket).toHaveBeenCalledWith(
        TEST_TUNNEL_URL,
        expect.objectContaining({
          headers: { Authorization: "Bearer caller_supplied_token" },
        }),
      );
    });

    it("still refreshes when caller-supplied credentials are expired", async () => {
      const callerCreds: TunnelCredentials = {
        ...mockCredentials,
        access_token: "expired_token",
      };
      mockCredentialsService.isTokenExpired.mockReturnValue(true);

      const connectPromise = client.connect(callerCreds);

      await new Promise((resolve) => setImmediate(resolve));

      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://abc123.tunnel.ankimcp.ai",
        }),
      );
      await connectPromise;

      // Did not re-read from disk (caller supplied), but did refresh.
      expect(mockCredentialsService.loadCredentials).not.toHaveBeenCalled();
      expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledWith(
        "mock_refresh_token",
      );
    }, 10000);

    // Regression: a non-auth WS `close` arriving BEFORE `tunnel_established`
    // (e.g. a 4008 SERVICE_UNAVAILABLE, which fires AFTER `open` and surfaces as
    // a 'close' rather than an 'error') must settle the pending
    // establishConnection promise. Previously only the WebSocket 'error' path
    // rejected, so a pre-established close left connect() hanging forever: its
    // private `isConnecting` guard stayed latched true and the next connect()
    // threw `connection_in_progress`, wedging the client permanently.
    //
    // A NON-auth code is used deliberately: auth closes (4001/4003) now route
    // through establishWithAuthRetry's single-shot refresh-and-retry (covered by
    // the dedicated pre-established-auth tests below), whereas every other
    // pre-established close still fails fast with "connection_closed". This test
    // pins that fail-fast branch plus the wedge fix.
    //
    // This test lives in the `connect` describe (alongside the other
    // pre-established failure tests) precisely because that block has NO
    // tunnel-establishing beforeEach — we must reach `open` but never emit
    // `tunnel_established`, exercising the `wasEstablished === false` branch of
    // the close handler.
    it("rejects the pending connect on a non-auth (4008) close before tunnel_established and clears the in-progress guard", async () => {
      // A first-connect pre-established close is owned by connect() and does not
      // schedule a background reconnect, but keep a no-op 'error' listener so any
      // stray emit can never surface as an unhandled emitter error.
      client.on("error", () => {});

      // First attempt: reach `open` (past the handshake) but NEVER emit
      // `tunnel_established`, then close with a non-auth 4008.
      const firstConnect = client.connect();
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");

      Object.defineProperty(mockWs, "readyState", { value: WebSocket.CLOSED });
      mockWs.emit(
        "close",
        TunnelCloseCodes.SERVICE_UNAVAILABLE,
        Buffer.from("Service unavailable"),
      );

      // Assertion 1: the pending promise REJECTS (does not hang) with the
      // dedicated pre-established close code.
      await expect(firstConnect).rejects.toThrow(
        expect.objectContaining({ code: "connection_closed" }),
      );

      // Assertion 2: the wedge is cleared — a fresh connect() must proceed to a
      // new attempt instead of throwing `connection_in_progress`. Drive it to a
      // clean success against a fresh socket to prove it got past the guard.
      const secondMockWs = createMockWs();
      (WebSocket as any).mockImplementation(() => secondMockWs);

      const secondConnect = client.connect();
      await Promise.resolve();
      Object.defineProperty(secondMockWs, "readyState", {
        value: WebSocket.OPEN,
      });
      secondMockWs.emit("open");
      secondMockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://second.tunnel.ankimcp.ai",
        }),
      );

      await expect(secondConnect).resolves.toBe(
        "https://second.tunnel.ankimcp.ai",
      );
    });

    // A pre-established auth close (4001/4003) on the FIRST/CLI connect is no
    // longer fatal: establishWithAuthRetry refreshes the token ONCE and retries
    // establishConnection ONCE. ws1 auth-closes before `tunnel_established`;
    // after the refresh, ws2 establishes and connect() resolves.
    it("recovers a pre-established 4003 by refreshing the token once and retrying", async () => {
      client.on("error", () => {});
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      (WebSocket as any)
        .mockImplementationOnce(() => ws1)
        .mockImplementationOnce(() => ws2);

      const connectPromise = client.connect();
      await Promise.resolve();

      // ws1: open then a pre-established 4003 auth close.
      Object.defineProperty(ws1, "readyState", { value: WebSocket.OPEN });
      ws1.emit("open");
      Object.defineProperty(ws1, "readyState", { value: WebSocket.CLOSED });
      ws1.emit(
        "close",
        TunnelCloseCodes.TUNNEL_AUTH_FAILED,
        Buffer.from("Tunnel auth failed"),
      );

      // Let establishWithAuthRetry refresh the token and open the retry socket.
      await new Promise((resolve) => setImmediate(resolve));

      // ws2: open then tunnel_established → connect resolves.
      Object.defineProperty(ws2, "readyState", { value: WebSocket.OPEN });
      ws2.emit("open");
      ws2.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://retry.tunnel.ankimcp.ai",
        }),
      );

      await expect(connectPromise).resolves.toBe(
        "https://retry.tunnel.ankimcp.ai",
      );
      // Exactly one refresh, and the socket was reconstructed for the retry.
      expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledTimes(1);
      expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledWith(
        "mock_refresh_token",
      );
      expect(WebSocket).toHaveBeenCalledTimes(2);
    });

    // The single-shot retry does NOT loop: if a freshly refreshed token STILL
    // auth-closes pre-established, re-login is the real fix, so the failure is
    // remapped from a generic connection error to "session_expired".
    it("surfaces session_expired when a refreshed token is STILL rejected (persistent 4003)", async () => {
      // No 'error' is emitted on this path, but guard against any stray emit.
      client.on("error", () => {});

      const ws1 = createMockWs();
      const ws2 = createMockWs();
      (WebSocket as any)
        .mockImplementationOnce(() => ws1)
        .mockImplementationOnce(() => ws2);

      const connectPromise = client.connect();
      await Promise.resolve();

      // ws1: open then a pre-established 4003.
      Object.defineProperty(ws1, "readyState", { value: WebSocket.OPEN });
      ws1.emit("open");
      Object.defineProperty(ws1, "readyState", { value: WebSocket.CLOSED });
      ws1.emit(
        "close",
        TunnelCloseCodes.TUNNEL_AUTH_FAILED,
        Buffer.from("Tunnel auth failed"),
      );

      // Refresh succeeds, the retry socket opens...
      await new Promise((resolve) => setImmediate(resolve));

      // ...but the freshly refreshed token is rejected again with 4003.
      Object.defineProperty(ws2, "readyState", { value: WebSocket.OPEN });
      ws2.emit("open");
      Object.defineProperty(ws2, "readyState", { value: WebSocket.CLOSED });
      ws2.emit(
        "close",
        TunnelCloseCodes.TUNNEL_AUTH_FAILED,
        Buffer.from("Tunnel auth failed"),
      );

      await expect(connectPromise).rejects.toThrow(
        expect.objectContaining({ code: "session_expired" }),
      );
      // Refreshed exactly once — there is no second refresh/retry loop.
      expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledTimes(1);
    });

    // When the refresh itself fails (dead refresh_token), refreshTokenAndSave
    // throws "session_expired" before any retry socket is opened — fail fast,
    // and nothing is persisted.
    it("fails fast with session_expired (no retry socket) when the refresh token is dead", async () => {
      client.on("error", () => {});

      mockDeviceFlowService.refreshToken.mockRejectedValue(
        new DeviceFlowError("Token expired", "invalid_grant"),
      );

      const connectPromise = client.connect();
      await Promise.resolve();

      // Single socket: open then a pre-established 4003.
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.CLOSED });
      mockWs.emit(
        "close",
        TunnelCloseCodes.TUNNEL_AUTH_FAILED,
        Buffer.from("Tunnel auth failed"),
      );

      await expect(connectPromise).rejects.toThrow(
        expect.objectContaining({ code: "session_expired" }),
      );
      // No retry socket was opened, and nothing was persisted.
      expect(WebSocket).toHaveBeenCalledTimes(1);
      expect(mockCredentialsService.saveCredentials).not.toHaveBeenCalled();
    });
  });

  describe("disconnect", () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://test.tunnel.ankimcp.ai",
        }),
      );
      await connectPromise;
    });

    it("should close WebSocket connection", () => {
      client.disconnect();

      expect(mockWs.close).toHaveBeenCalledWith(
        TunnelCloseCodes.NORMAL,
        "Client disconnect",
      );
    });

    it("should clear tunnel URL", () => {
      expect(client.getTunnelUrl()).not.toBeNull();
      client.disconnect();
      expect(client.getTunnelUrl()).toBeNull();
    });
  });

  describe("message handling", () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://test.tunnel.ankimcp.ai",
        }),
      );
      await connectPromise;
    });

    it("should handle MCP request and send response", async () => {
      const requestMessage = {
        type: "request",
        requestId: "req123",
        method: "POST",
        path: "/mcp/v1",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "test" }),
      };

      mockWs.emit("message", JSON.stringify(requestMessage));

      // Wait for handler to complete
      await Promise.resolve();
      await Promise.resolve();

      expect(mockMcpHandler.handle).toHaveBeenCalledWith({
        method: "POST",
        path: "/mcp/v1",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "test" }),
      });

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "response",
          requestId: "req123",
          statusCode: 200,
          headers: {},
          body: JSON.stringify({ result: "ok" }),
        }),
      );
    });

    it("should map a generic handler error to a 500/-32006 JSON-RPC envelope", async () => {
      mockMcpHandler.handle.mockRejectedValue(new Error("Handler error"));

      const requestMessage = {
        type: "request",
        requestId: "req123",
        method: "POST",
        path: "/mcp/v1",
        headers: {},
        body: "{}",
      };

      mockWs.emit("message", JSON.stringify(requestMessage));

      // Wait for handler to complete
      await Promise.resolve();
      await Promise.resolve();

      const sentData = (mockWs.send as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(sentData);

      expect(parsed.type).toBe("response");
      expect(parsed.requestId).toBe("req123");
      expect(parsed.statusCode).toBe(500);
      expect(JSON.parse(parsed.body)).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32006, message: "Failed to forward request to CLI" },
      });
    });

    it("should map an MCP request timeout to a 504/-32004 envelope", async () => {
      mockMcpHandler.handle.mockRejectedValue(new Error("MCP request timeout"));

      const requestMessage = {
        type: "request",
        requestId: "req-timeout",
        method: "POST",
        path: "/mcp/v1",
        headers: {},
        body: "{}",
      };

      mockWs.emit("message", JSON.stringify(requestMessage));

      await Promise.resolve();
      await Promise.resolve();

      const sentData = (mockWs.send as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(sentData);

      expect(parsed.statusCode).toBe(504);
      expect(JSON.parse(parsed.body)).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32004, message: "Request to CLI timed out" },
      });
    });

    it("should map a closed transport to a 503/-32005 envelope", async () => {
      mockMcpHandler.handle.mockRejectedValue(new Error("Transport closed"));

      const requestMessage = {
        type: "request",
        requestId: "req-closed",
        method: "POST",
        path: "/mcp/v1",
        headers: {},
        body: "{}",
      };

      mockWs.emit("message", JSON.stringify(requestMessage));

      await Promise.resolve();
      await Promise.resolve();

      const sentData = (mockWs.send as jest.Mock).mock.calls[0][0];
      const parsed = JSON.parse(sentData);

      expect(parsed.statusCode).toBe(503);
      expect(JSON.parse(parsed.body)).toEqual({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32005, message: "Tunnel connection is not available" },
      });
    });

    it("should respond to ping with pong", () => {
      const timestamp = Date.now();
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "ping",
          timestamp,
        }),
      );

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: "pong",
          timestamp,
        }),
      );
    });

    it("should emit error event on server error message", () => {
      const errorSpy = jest.fn();
      client.on("error", errorSpy);

      mockWs.emit(
        "message",
        JSON.stringify({
          type: "error",
          code: "rate_limit",
          message: "Rate limit exceeded",
        }),
      );

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "rate_limit",
          message: "Rate limit exceeded",
        }),
      );
    });
  });

  describe("utility methods", () => {
    it("should return connection status", async () => {
      expect(client.isConnected()).toBe(false);

      const connectPromise = client.connect();
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://test.tunnel.ankimcp.ai",
        }),
      );
      await connectPromise;

      expect(client.isConnected()).toBe(true);
    });

    it("should return current tunnel URL", async () => {
      expect(client.getTunnelUrl()).toBeNull();

      const connectPromise = client.connect();
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");

      const tunnelUrl = "https://abc123.tunnel.ankimcp.ai";
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: tunnelUrl,
        }),
      );
      await connectPromise;

      expect(client.getTunnelUrl()).toBe(tunnelUrl);
    });
  });

  describe("reconnection behavior", () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      await Promise.resolve();
      Object.defineProperty(mockWs, "readyState", { value: WebSocket.OPEN });
      mockWs.emit("open");
      mockWs.emit(
        "message",
        JSON.stringify({
          type: "tunnel_established",
          url: "https://test.tunnel.ankimcp.ai",
        }),
      );
      await connectPromise;
      jest.clearAllMocks();

      // Re-setup mocks cleared by jest.clearAllMocks()
      mockCredentialsService.loadCredentials.mockResolvedValue(mockCredentials);
      mockCredentialsService.saveCredentials.mockResolvedValue(undefined);
      mockCredentialsService.isTokenExpired.mockReturnValue(false);
      mockDeviceFlowService.refreshToken.mockResolvedValue(mockTokenResponse);
    });

    /**
     * Helper: simulate a close event on the current mockWs.
     * Sets readyState to CLOSED before emitting so the client
     * sees the socket as closed and can attempt reconnection.
     */
    function emitClose(code: number, reason: string): void {
      Object.defineProperty(mockWs, "readyState", {
        value: WebSocket.CLOSED,
      });
      mockWs.emit("close", code, Buffer.from(reason));
    }

    it("should not reconnect on normal close (1000)", () => {
      emitClose(TunnelCloseCodes.NORMAL, "Normal closure");

      expect(WebSocket).not.toHaveBeenCalled();
    });

    it("should not reconnect on account deleted (4004)", () => {
      emitClose(TunnelCloseCodes.ACCOUNT_DELETED, "Account deleted");

      expect(WebSocket).not.toHaveBeenCalled();
    });

    it("should not reconnect on session replaced (4005)", () => {
      emitClose(TunnelCloseCodes.SESSION_REPLACED, "Session replaced");

      expect(WebSocket).not.toHaveBeenCalled();
    });

    it("should emit session_expired on token revoked (4002)", () => {
      const errorSpy = jest.fn();
      client.on("error", errorSpy);

      emitClose(TunnelCloseCodes.TOKEN_REVOKED, "Token revoked");

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "session_expired",
          message:
            "Token was revoked. Please run `ankimcp --login` to re-authenticate.",
        }),
      );
      expect(WebSocket).not.toHaveBeenCalled();
    });

    it("should refresh token on auth failed (4001) before reconnect", async () => {
      jest.useFakeTimers();

      try {
        // Prepare a fresh mock ws for the reconnect attempt
        const reconnectMockWs = createMockWs();
        (WebSocket as any).mockImplementation(() => reconnectMockWs);

        // Suppress unhandled error events from reconnect
        client.on("error", () => {});

        emitClose(TunnelCloseCodes.AUTH_FAILED, "Auth failed");

        // Advance past the reconnect delay
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledWith(
          "mock_refresh_token",
        );
        expect(WebSocket).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should refresh token on tunnel auth failed (4003) before reconnect", async () => {
      jest.useFakeTimers();

      try {
        const reconnectMockWs = createMockWs();
        (WebSocket as any).mockImplementation(() => reconnectMockWs);

        client.on("error", () => {});

        emitClose(TunnelCloseCodes.TUNNEL_AUTH_FAILED, "Tunnel auth failed");

        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledWith(
          "mock_refresh_token",
        );
        expect(WebSocket).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reconnect with backoff on URL regenerated (4006)", async () => {
      jest.useFakeTimers();

      try {
        const reconnectMockWs = createMockWs();
        (WebSocket as any).mockImplementation(() => reconnectMockWs);

        client.on("error", () => {});

        emitClose(TunnelCloseCodes.URL_REGENERATED, "URL regenerated");

        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        expect(mockDeviceFlowService.refreshToken).not.toHaveBeenCalled();
        expect(WebSocket).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reconnect with backoff on service unavailable (4008)", async () => {
      jest.useFakeTimers();

      try {
        const reconnectMockWs = createMockWs();
        (WebSocket as any).mockImplementation(() => reconnectMockWs);

        client.on("error", () => {});

        emitClose(TunnelCloseCodes.SERVICE_UNAVAILABLE, "Service unavailable");

        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        expect(mockDeviceFlowService.refreshToken).not.toHaveBeenCalled();
        expect(WebSocket).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reconnect with backoff on unknown close code", async () => {
      jest.useFakeTimers();

      try {
        const reconnectMockWs = createMockWs();
        (WebSocket as any).mockImplementation(() => reconnectMockWs);

        client.on("error", () => {});

        emitClose(4999, "Unknown code");

        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        expect(mockDeviceFlowService.refreshToken).not.toHaveBeenCalled();
        expect(WebSocket).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should emit disconnected with willReconnect=false on a permanent close", () => {
      const disconnectedSpy = jest.fn();
      client.on("disconnected", disconnectedSpy);

      emitClose(TunnelCloseCodes.NORMAL, "Test close");

      expect(disconnectedSpy).toHaveBeenCalledWith(
        TunnelCloseCodes.NORMAL,
        "Test close",
        false,
      );
    });

    it("should emit disconnected with willReconnect=true on a recoverable close", () => {
      const disconnectedSpy = jest.fn();
      client.on("disconnected", disconnectedSpy);

      emitClose(TunnelCloseCodes.URL_REGENERATED, "URL regenerated");

      expect(disconnectedSpy).toHaveBeenCalledWith(
        TunnelCloseCodes.URL_REGENERATED,
        "URL regenerated",
        true,
      );
    });

    it("should reconnect with backoff on going away (1001)", async () => {
      jest.useFakeTimers();
      try {
        client.on("error", () => {});
        emitClose(TunnelCloseCodes.GOING_AWAY, "Server shutting down");
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );
        expect(mockCredentialsService.loadCredentials).toHaveBeenCalled();
        expect(mockDeviceFlowService.refreshToken).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should reconnect with backoff on shutdown (4009)", async () => {
      jest.useFakeTimers();
      try {
        client.on("error", () => {});
        emitClose(TunnelCloseCodes.SHUTDOWN, "Server shutdown");
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );
        expect(mockCredentialsService.loadCredentials).toHaveBeenCalled();
        expect(mockDeviceFlowService.refreshToken).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("should stop reconnecting after max attempts", () => {
      const errorSpy = jest.fn();
      client.on("error", errorSpy);
      (client as any).reconnectAttempts =
        TUNNEL_DEFAULTS.RECONNECT_MAX_ATTEMPTS;
      emitClose(TunnelCloseCodes.SERVICE_UNAVAILABLE, "Service unavailable");
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "max_reconnect_attempts",
        }),
      );
      expect(WebSocket).not.toHaveBeenCalled();
    });

    it("should emit session_expired when token refresh fails during auth reconnect", async () => {
      jest.useFakeTimers();
      try {
        const errorSpy = jest.fn();
        client.on("error", errorSpy);
        mockDeviceFlowService.refreshToken.mockRejectedValue(
          new DeviceFlowError("Token expired", "invalid_grant"),
        );
        emitClose(TunnelCloseCodes.AUTH_FAILED, "Auth failed");
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );
        // Wait for async operations
        await Promise.resolve();
        await Promise.resolve();
        expect(errorSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            code: "session_expired",
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("should not reconnect after manual disconnect", () => {
      client.disconnect();
      jest.clearAllMocks();
      mockWs.emit(
        "close",
        TunnelCloseCodes.GOING_AWAY,
        Buffer.from("Server shutting down"),
      );
      expect(WebSocket).not.toHaveBeenCalled();
    });

    // On the reconnect path, handleReconnection already refreshes the token for
    // auth codes BEFORE reconnecting. establishWithAuthRetry must therefore be a
    // no-op passthrough (isReconnecting=true) — otherwise an auth-close on the
    // reconnect socket would trigger a SECOND refresh. This pins exactly-once.
    it("does not double-refresh when a reconnect attempt itself auth-closes pre-established", async () => {
      jest.useFakeTimers();
      try {
        client.on("error", () => {});

        // The single reconnect attempt gets its own fresh socket.
        const reconnectWs = createMockWs();
        (WebSocket as any).mockImplementationOnce(() => reconnectWs);

        // Mid-session auth drop schedules an auth-refresh reconnect.
        emitClose(TunnelCloseCodes.TUNNEL_AUTH_FAILED, "Tunnel auth failed");

        // Fire the reconnect timer: handleReconnection refreshes ONCE, then
        // connect() → establishWithAuthRetry (isReconnecting=true) establishes
        // plainly with NO additional refresh.
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        // The reconnect socket auth-closes again BEFORE tunnel_established.
        Object.defineProperty(reconnectWs, "readyState", {
          value: WebSocket.OPEN,
        });
        reconnectWs.emit("open");
        Object.defineProperty(reconnectWs, "readyState", {
          value: WebSocket.CLOSED,
        });
        reconnectWs.emit(
          "close",
          TunnelCloseCodes.TUNNEL_AUTH_FAILED,
          Buffer.from("Tunnel auth failed"),
        );

        // Flush the failed connect()'s rejection microtasks.
        await Promise.resolve();
        await Promise.resolve();

        // Exactly ONE refresh for this attempt — handleReconnection's only;
        // establishWithAuthRetry added none on the reconnect path.
        expect(mockDeviceFlowService.refreshToken).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });

    // The close handler's "first connect owns the outcome" skip is keyed off
    // isReconnecting, so a pre-established close during a RECONNECT attempt still
    // flows through handleReconnection. This keeps the backoff loop alive:
    // reconnectAttempts increments and the next attempt is scheduled/constructed.
    it("keeps the backoff loop alive after a reconnect attempt auth-closes pre-established", async () => {
      jest.useFakeTimers();
      try {
        client.on("error", () => {});

        const reconnectWs1 = createMockWs();
        const reconnectWs2 = createMockWs();
        (WebSocket as any)
          .mockImplementationOnce(() => reconnectWs1)
          .mockImplementationOnce(() => reconnectWs2);

        // Mid-session auth drop → reconnect attempt #1 (reconnectAttempts → 1).
        emitClose(TunnelCloseCodes.TUNNEL_AUTH_FAILED, "Tunnel auth failed");
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY + 500,
        );

        // Attempt #1's socket auth-closes pre-established.
        Object.defineProperty(reconnectWs1, "readyState", {
          value: WebSocket.OPEN,
        });
        reconnectWs1.emit("open");
        Object.defineProperty(reconnectWs1, "readyState", {
          value: WebSocket.CLOSED,
        });
        reconnectWs1.emit(
          "close",
          TunnelCloseCodes.TUNNEL_AUTH_FAILED,
          Buffer.from("Tunnel auth failed"),
        );
        await Promise.resolve();
        await Promise.resolve();

        // The first-connect skip did NOT kill the loop: the reconnect-path close
        // routed through handleReconnection, incrementing the counter and
        // scheduling attempt #2.
        expect((client as any).reconnectAttempts).toBe(2);

        const constructsBefore = (WebSocket as unknown as jest.Mock).mock.calls
          .length;

        // Fire attempt #2 (backoff ~2s) — but stop short of the 10s connection
        // timeout so socket construction is the only observable timer effect.
        await jest.advanceTimersByTimeAsync(
          TUNNEL_DEFAULTS.RECONNECT_INITIAL_DELAY * 3 + 500,
        );

        // A further socket was constructed → the backoff loop survived.
        expect(
          (WebSocket as unknown as jest.Mock).mock.calls.length,
        ).toBeGreaterThan(constructsBefore);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
