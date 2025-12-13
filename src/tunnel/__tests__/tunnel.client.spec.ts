import { EventEmitter } from "events";
import WebSocket from "ws";
import { TunnelClient, McpRequestHandler, TunnelClientError } from "../tunnel.client";
import { CredentialsService, TunnelCredentials } from "../credentials.service";
import { DeviceFlowService, DeviceFlowError, TokenResponse } from "../device-flow.service";
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
      getCredentialsPath: jest.fn().mockReturnValue("~/.ankimcp/credentials.json"),
    } as any;

    // Mock DeviceFlowService
    mockDeviceFlowService = {
      refreshToken: jest.fn().mockResolvedValue({
        access_token: "new_access_token",
        refresh_token: "new_refresh_token",
        expires_in: 3600,
        token_type: "Bearer",
      } as TokenResponse),
    } as any;

    // Mock WebSocket instance
    mockWs = new EventEmitter() as any;
    mockWs.readyState = WebSocket.CONNECTING;
    mockWs.send = jest.fn();
    mockWs.close = jest.fn();
    mockWs.terminate = jest.fn();

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
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");

      // Simulate tunnel_established message
      const tunnelUrl = "https://abc123.tunnel.ankimcp.ai";
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: tunnelUrl,
        expiresAt: null,
      }));

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
      await new Promise(resolve => setImmediate(resolve));

      // Simulate WebSocket open
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");

      // Simulate tunnel_established message
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: "https://abc123.tunnel.ankimcp.ai",
        expiresAt: null,
      }));

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
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");

      const tunnelUrl = "https://abc123.tunnel.ankimcp.ai";
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: tunnelUrl,
        expiresAt: null,
      }));

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
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: "https://test.tunnel.ankimcp.ai",
        expiresAt: null,
      }));
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
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: "https://test.tunnel.ankimcp.ai",
        expiresAt: null,
      }));
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
          event: "response",
          data: {
            type: "response",
            requestId: "req123",
            statusCode: 200,
            headers: {},
            body: JSON.stringify({ result: "ok" }),
          },
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
      const wrapped = JSON.parse(sentData);

      expect(wrapped.event).toBe("response");
      expect(wrapped.data.statusCode).toBe(500);
      expect(wrapped.data.requestId).toBe("req123");
    });

    it("should respond to ping with pong", () => {
      const timestamp = Date.now();
      mockWs.emit("message", JSON.stringify({
        type: "ping",
        timestamp,
      }));

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({
          event: "pong",
          data: {
            type: "pong",
            timestamp,
          },
        }),
      );
    });

    it("should emit error event on server error message", () => {
      const errorSpy = jest.fn();
      client.on("error", errorSpy);

      mockWs.emit("message", JSON.stringify({
        type: "error",
        code: "rate_limit",
        message: "Rate limit exceeded",
      }));

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

      mockWs.emit("message", JSON.stringify({
        type: "url_changed",
        oldUrl: "https://old.tunnel.ankimcp.ai",
        newUrl: "https://new.tunnel.ankimcp.ai",
      }));

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
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: "https://test.tunnel.ankimcp.ai",
        expiresAt: null,
      }));
      await connectPromise;

      expect(client.isConnected()).toBe(true);
    });

    it("should return current tunnel URL", async () => {
      expect(client.getTunnelUrl()).toBeNull();

      const connectPromise = client.connect();
      await Promise.resolve();
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");

      const tunnelUrl = "https://abc123.tunnel.ankimcp.ai";
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: tunnelUrl,
        expiresAt: null,
      }));
      await connectPromise;

      expect(client.getTunnelUrl()).toBe(tunnelUrl);
    });
  });

  describe("token refresh on auth errors", () => {
    beforeEach(async () => {
      const connectPromise = client.connect();
      await Promise.resolve();
      mockWs.readyState = WebSocket.OPEN;
      mockWs.emit("open");
      mockWs.emit("message", JSON.stringify({
        type: "tunnel_established",
        url: "https://test.tunnel.ankimcp.ai",
        expiresAt: null,
      }));
      await connectPromise;
      jest.clearAllMocks();
    });

    it("should not reconnect on account suspended", () => {
      const errorSpy = jest.fn();
      client.on("error", errorSpy);

      mockWs.emit("close", TunnelCloseCodes.ACCOUNT_SUSPENDED, Buffer.from("Account suspended"));

      // Check that no new WebSocket was created (no reconnection attempt)
      expect(WebSocket).not.toHaveBeenCalled();
    });

    it("should emit disconnected event on close", () => {
      const disconnectedSpy = jest.fn();
      client.on("disconnected", disconnectedSpy);

      mockWs.emit("close", TunnelCloseCodes.NORMAL, Buffer.from("Test close"));

      expect(disconnectedSpy).toHaveBeenCalledWith(
        TunnelCloseCodes.NORMAL,
        "Test close",
      );
    });
  });
});
