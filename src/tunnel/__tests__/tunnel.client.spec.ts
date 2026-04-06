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
          expiresAt: null,
        }),
      );

      const result = await connectPromise;

      expect(result).toBe(tunnelUrl);
      expect(mockCredentialsService.loadCredentials).toHaveBeenCalled();
      expect(WebSocket).toHaveBeenCalledWith(
        TUNNEL_DEFAULTS.URL,
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
          expiresAt: null,
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
          expiresAt: null,
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
          expiresAt: null,
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
          expiresAt: null,
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

    it("should handle MCP request error and send 500 response", async () => {
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
      expect(parsed.statusCode).toBe(500);
      expect(parsed.requestId).toBe("req123");
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

    it("should emit url_changed event on url_changed message", () => {
      const urlChangedSpy = jest.fn();
      client.on("url_changed", urlChangedSpy);

      mockWs.emit(
        "message",
        JSON.stringify({
          type: "url_changed",
          oldUrl: "https://old.tunnel.ankimcp.ai",
          newUrl: "https://new.tunnel.ankimcp.ai",
        }),
      );

      expect(urlChangedSpy).toHaveBeenCalledWith(
        "https://old.tunnel.ankimcp.ai",
        "https://new.tunnel.ankimcp.ai",
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
          expiresAt: null,
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
          expiresAt: null,
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
          expiresAt: null,
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

    it("should emit disconnected event on close", () => {
      const disconnectedSpy = jest.fn();
      client.on("disconnected", disconnectedSpy);

      emitClose(TunnelCloseCodes.NORMAL, "Test close");

      expect(disconnectedSpy).toHaveBeenCalledWith(
        TunnelCloseCodes.NORMAL,
        "Test close",
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
          new DeviceFlowError("invalid_grant", "Token expired"),
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
  });
});
