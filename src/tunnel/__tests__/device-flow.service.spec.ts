import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import {
  DeviceFlowService,
  DeviceFlowError,
  DeviceCodeResponse,
  TokenResponse,
  DeviceFlowErrorResponse,
} from "../device-flow.service";
import ky, { HTTPError, TimeoutError } from "ky";
import { AppConfigService } from "../../app-config.service";

// Mock ky module
jest.mock("ky", () => {
  const mockPost = jest.fn();
  const mockKyInstance = {
    post: mockPost,
  };
  const mockCreate = jest.fn(() => mockKyInstance);

  // MockHTTPError for simulating HTTP errors
  class MockHTTPError extends Error {
    public response: any;
    public request: any;
    public options: any;

    constructor(response: any, request: any, options?: any) {
      const code =
        response.status || response.status === 0 ? response.status : "";
      const title = response.statusText ?? "";
      const status = `${code} ${title}`.trim();
      const reason = status ? `status code ${status}` : "an unknown error";
      const message = `Request failed with ${reason}: ${request.method || "POST"} ${request.url || "https://auth.ankimcp.ai"}`;

      super(message);
      this.name = "HTTPError";
      this.response = response;
      this.request = request;
      this.options = options;
    }
  }

  // MockTimeoutError for simulating timeouts
  class MockTimeoutError extends Error {
    public request: any;

    constructor(request: any) {
      super(`Request timed out: ${request.method || "POST"} ${request.url}`);
      this.name = "TimeoutError";
      this.request = request;
    }
  }

  return {
    __esModule: true,
    default: {
      create: mockCreate,
    },
    HTTPError: MockHTTPError,
    TimeoutError: MockTimeoutError,
  };
});

describe("DeviceFlowService", () => {
  let service: DeviceFlowService;
  let mockKyInstance: any;
  let loggerSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;
  let loggerErrorSpy: jest.SpyInstance;
  let mockConfigService: jest.Mocked<AppConfigService>;

  // Helper to create mock Response
  const createMockResponse = (
    status: number,
    statusText: string,
    jsonData?: any,
  ): Response => {
    const mockResponse = {
      status,
      statusText,
      headers: new Headers(),
      ok: status >= 200 && status < 300,
      redirected: false,
      type: "basic" as const,
      url: "https://auth.ankimcp.ai/realms/ankimcp/protocol/openid-connect/token",
      clone: () => mockResponse as Response,
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob([])),
      formData: () => Promise.resolve({} as FormData),
      json: () => Promise.resolve(jsonData || {}),
      text: () => Promise.resolve(JSON.stringify(jsonData || {})),
    } as Response;
    return mockResponse;
  };

  // Helper to create mock Request
  const createMockRequest = (): Request => {
    return new Request(
      "https://auth.ankimcp.ai/realms/ankimcp/protocol/openid-connect/auth/device",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );
  };

  // Helper to create mock NormalizedOptions
  const createMockOptions = (): any => {
    return {
      method: "POST",
      retry: {
        limit: 0,
      },
      timeout: 10000,
    };
  };

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    jest.useRealTimers(); // Default to real timers

    // Get reference to the mock ky instance
    mockKyInstance = (ky as any).create();

    // Create mock config service
    mockConfigService = {
      tunnelServerUrl: "wss://tunnel.ankimcp.ai",
      authClientId: "ankimcp-cli",
    } as jest.Mocked<AppConfigService>;

    // Create testing module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceFlowService,
        {
          provide: AppConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DeviceFlowService>(DeviceFlowService);

    // Setup logger spies
    loggerSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    loggerDebugSpy = jest.spyOn(Logger.prototype, "debug").mockImplementation();
    loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe("Constructor", () => {
    it("should initialize with default configuration", () => {
      expect(service).toBeDefined();
      expect((ky as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: 10000,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          retry: {
            limit: 0,
          },
          hooks: {
            beforeRequest: expect.any(Array),
          },
        }),
      );
    });

    it("should have correct tunnel configuration", () => {
      const config = service.getConfig();
      expect(config.tunnelUrl).toBe("wss://tunnel.ankimcp.ai");
      expect(config.clientId).toBe("ankimcp-cli");
    });
  });

  describe("requestDeviceCode()", () => {
    it("should return device code response on success", async () => {
      const mockResponse: DeviceCodeResponse = {
        device_code: "test-device-code-12345",
        user_code: "ABCD-1234",
        verification_uri: "https://auth.ankimcp.ai/device",
        verification_uri_complete:
          "https://auth.ankimcp.ai/device?code=ABCD-1234",
        expires_in: 600,
        interval: 5,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await service.requestDeviceCode();

      expect(result).toEqual(mockResponse);
      expect(mockKyInstance.post).toHaveBeenCalledWith(
        expect.stringContaining("/auth/device"),
        expect.objectContaining({
          body: expect.stringContaining("client_id=ankimcp-cli"),
        }),
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        "Requesting device code from tunnel service",
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        "Device code received successfully",
      );
    });

    it("should log user code in debug mode", async () => {
      const mockResponse: DeviceCodeResponse = {
        device_code: "test-device-code",
        user_code: "WXYZ-5678",
        verification_uri: "https://auth.ankimcp.ai/device",
        expires_in: 600,
        interval: 5,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await service.requestDeviceCode();

      expect(loggerDebugSpy).toHaveBeenCalledWith("User code: WXYZ-5678");
    });

    it("should throw DeviceFlowError on network error", async () => {
      const networkError = new Error("fetch failed: ECONNREFUSED");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        DeviceFlowError,
      );
      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Cannot connect to tunnel service",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect(error).toBeInstanceOf(DeviceFlowError);
        expect((error as DeviceFlowError).code).toBe("network_error");
      }
    });

    it("should throw DeviceFlowError on HTTP 403 error", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(403, "Forbidden"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        DeviceFlowError,
      );
      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Authentication failed. Invalid client configuration.",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("auth_failed");
      }
    });

    it("should throw DeviceFlowError on HTTP 500 error", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(500, "Internal Server Error"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Tunnel service error. Please try again later.",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("server_error");
      }
    });

    it("should throw DeviceFlowError on timeout", async () => {
      const timeoutError = new TimeoutError(createMockRequest());

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(timeoutError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Request timeout. Please check your network connection.",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("timeout");
      }
    });

    it("should log errors via logger", async () => {
      const networkError = new Error("Test error");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Error in requestDeviceCode:",
        networkError,
      );
    });
  });

  describe("pollForToken()", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it("should return token when user authorizes immediately", async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
          customSlug: null,
        },
      };

      // First poll returns success
      mockKyInstance.post.mockReturnValueOnce({
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      });

      const pollPromise = service.pollForToken(
        "test-device-code",
        5, // 5 second interval
        600, // 10 minute expiry
      );

      // Advance timer past the first interval
      await jest.advanceTimersByTimeAsync(5000);

      const result = await pollPromise;

      expect(result).toEqual(mockTokenResponse);
      expect(mockKyInstance.post).toHaveBeenCalledTimes(1);
      expect(loggerSpy).toHaveBeenCalledWith("Starting token polling");
      expect(loggerSpy).toHaveBeenCalledWith("Token received successfully");
    });

    it("should continue polling on authorization_pending", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "authorization_pending",
        error_description: "User has not yet authorized",
      };

      const mockTokenResponse: TokenResponse = {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
          customSlug: null,
        },
      };

      // First two polls return authorization_pending, third succeeds
      mockKyInstance.post
        .mockReturnValueOnce({
          json: jest
            .fn()
            .mockRejectedValue(
              new HTTPError(
                createMockResponse(400, "Bad Request", mockErrorResponse),
                createMockRequest(),
                createMockOptions(),
              ),
            ),
        })
        .mockReturnValueOnce({
          json: jest
            .fn()
            .mockRejectedValue(
              new HTTPError(
                createMockResponse(400, "Bad Request", mockErrorResponse),
                createMockRequest(),
                createMockOptions(),
              ),
            ),
        })
        .mockReturnValueOnce({
          json: jest.fn().mockResolvedValue(mockTokenResponse),
        });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // Advance through polling intervals
      await jest.advanceTimersByTimeAsync(5000); // First poll
      await jest.advanceTimersByTimeAsync(5000); // Second poll
      await jest.advanceTimersByTimeAsync(5000); // Third poll (success)

      const result = await pollPromise;

      expect(result).toEqual(mockTokenResponse);
      expect(mockKyInstance.post).toHaveBeenCalledTimes(3);
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        "Authorization pending, continuing poll...",
      );
    });

    it("should increase interval on slow_down error", async () => {
      const mockSlowDownResponse: DeviceFlowErrorResponse = {
        error: "slow_down",
        error_description: "Polling too fast",
      };

      const mockTokenResponse: TokenResponse = {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
          customSlug: null,
        },
      };

      // First poll returns slow_down, second succeeds
      mockKyInstance.post
        .mockReturnValueOnce({
          json: jest
            .fn()
            .mockRejectedValue(
              new HTTPError(
                createMockResponse(400, "Bad Request", mockSlowDownResponse),
                createMockRequest(),
                createMockOptions(),
              ),
            ),
        })
        .mockReturnValueOnce({
          json: jest.fn().mockResolvedValue(mockTokenResponse),
        });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // First interval (5s)
      await jest.advanceTimersByTimeAsync(5000);

      // Second interval should be 10s (5s + 5s increase)
      await jest.advanceTimersByTimeAsync(10000);

      const result = await pollPromise;

      expect(result).toEqual(mockTokenResponse);
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        "Slow down requested, new interval: 10s",
      );
    });

    it("should throw DeviceFlowError on expired_token", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "expired_token",
        error_description: "Device code has expired",
      };

      mockKyInstance.post.mockReturnValueOnce({
        json: jest
          .fn()
          .mockRejectedValue(
            new HTTPError(
              createMockResponse(400, "Bad Request", mockErrorResponse),
              createMockRequest(),
              createMockOptions(),
            ),
          ),
      });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // Advance timer and wait for rejection
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush promises

      await expect(pollPromise).rejects.toThrow(DeviceFlowError);
      await expect(pollPromise).rejects.toThrow("Device code has expired");

      try {
        await pollPromise;
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("expired_token");
      }
    });

    it("should throw DeviceFlowError on access_denied", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "access_denied",
        error_description: "User denied the request",
      };

      mockKyInstance.post.mockReturnValueOnce({
        json: jest
          .fn()
          .mockRejectedValue(
            new HTTPError(
              createMockResponse(400, "Bad Request", mockErrorResponse),
              createMockRequest(),
              createMockOptions(),
            ),
          ),
      });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // Advance timer and wait for rejection
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush promises

      await expect(pollPromise).rejects.toThrow("User denied authorization");

      // Test error code by catching the rejection
      try {
        await pollPromise;
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("access_denied");
      }
    });

    it("should stop polling after expires_in timeout", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "authorization_pending",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest
          .fn()
          .mockRejectedValue(
            new HTTPError(
              createMockResponse(400, "Bad Request", mockErrorResponse),
              createMockRequest(),
              createMockOptions(),
            ),
          ),
      });

      const pollPromise = service.pollForToken(
        "test-device-code",
        5, // 5 second interval
        30, // 30 second expiry
      );

      // Advance time beyond expiry (30s)
      jest.advanceTimersByTime(35000);
      await Promise.resolve(); // Flush promises

      await expect(pollPromise).rejects.toThrow(
        "Polling timeout: device code expired before user authorization",
      );
    });

    it("should handle unknown error codes from Keycloak", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "unknown_error_code",
        error_description: "Something went wrong",
      };

      mockKyInstance.post.mockReturnValueOnce({
        json: jest
          .fn()
          .mockRejectedValue(
            new HTTPError(
              createMockResponse(400, "Bad Request", mockErrorResponse),
              createMockRequest(),
              createMockOptions(),
            ),
          ),
      });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // Advance timer and wait for rejection
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush promises

      await expect(pollPromise).rejects.toThrow(
        "Authorization failed: unknown_error_code",
      );
    });

    it("should handle unparseable error responses", async () => {
      // Create a proper 500 error that can't be parsed as DeviceFlowErrorResponse
      const mockResponse = createMockResponse(500, "Internal Server Error");
      // Create a new object with overridden json() method
      const mockResponseWithError = {
        ...mockResponse,
        json: () => Promise.reject(new Error("JSON parse error")),
      } as Response;

      const mockHttpError = new HTTPError(
        mockResponseWithError,
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValueOnce({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // Advance timer and wait for rejection
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush promises

      await expect(pollPromise).rejects.toThrow(
        "Tunnel service error. Please try again later.",
      );
    });

    it("should handle network errors during polling", async () => {
      const networkError = new Error("fetch failed: ECONNREFUSED");

      mockKyInstance.post.mockReturnValueOnce({
        json: jest.fn().mockRejectedValue(networkError),
      });

      const pollPromise = service.pollForToken("test-device-code", 5, 600);

      // Advance timer and wait for rejection
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush promises

      await expect(pollPromise).rejects.toThrow(
        "Cannot connect to tunnel service",
      );
    });

    it("should log polling start with debug info", async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
          customSlug: null,
        },
      };

      mockKyInstance.post.mockReturnValueOnce({
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      });

      const pollPromise = service.pollForToken("test-device-code", 7, 900);

      await jest.advanceTimersByTimeAsync(7000);
      await pollPromise;

      expect(loggerSpy).toHaveBeenCalledWith("Starting token polling");
      expect(loggerDebugSpy).toHaveBeenCalledWith(
        "Polling interval: 7s, expires in: 900s",
      );
    });

    it("should include correct request body", async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: "test-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
          customSlug: null,
        },
      };

      mockKyInstance.post.mockReturnValueOnce({
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      });

      const pollPromise = service.pollForToken("device-code-12345", 5, 600);

      await jest.advanceTimersByTimeAsync(5000);
      await pollPromise;

      expect(mockKyInstance.post).toHaveBeenCalledWith(
        expect.stringContaining("/token"),
        expect.objectContaining({
          timeout: 5000,
          body: expect.stringContaining(
            "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code",
          ),
        }),
      );
      expect(mockKyInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("device_code=device-code-12345"),
        }),
      );
      expect(mockKyInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("client_id=ankimcp-cli"),
        }),
      );
    });
  });

  describe("refreshToken()", () => {
    it("should return new token response on success", async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: "new-access-token",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
          customSlug: null,
        },
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockTokenResponse),
      });

      const result = await service.refreshToken("old-refresh-token");

      expect(result).toEqual(mockTokenResponse);
      expect(mockKyInstance.post).toHaveBeenCalledWith(
        expect.stringContaining("/token"),
        expect.objectContaining({
          body: expect.stringContaining("grant_type=refresh_token"),
        }),
      );
      expect(mockKyInstance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining("refresh_token=old-refresh-token"),
        }),
      );
      expect(loggerSpy).toHaveBeenCalledWith("Refreshing access token via tunnel service");
      expect(loggerSpy).toHaveBeenCalledWith("Token refreshed successfully");
    });

    it("should throw DeviceFlowError on invalid_grant error", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "invalid_grant",
        error_description: "Refresh token is invalid or expired",
      };

      const mockHttpError = new HTTPError(
        createMockResponse(400, "Bad Request", mockErrorResponse),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(
        service.refreshToken("expired-refresh-token"),
      ).rejects.toThrow(DeviceFlowError);
      await expect(
        service.refreshToken("expired-refresh-token"),
      ).rejects.toThrow(
        "Refresh token is invalid or expired. Please login again.",
      );

      try {
        await service.refreshToken("expired-refresh-token");
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("invalid_grant");
        expect((error as DeviceFlowError).description).toBe(
          "Refresh token is invalid or expired",
        );
      }
    });

    it("should throw DeviceFlowError on HTTP 400 with other error", async () => {
      const mockErrorResponse: DeviceFlowErrorResponse = {
        error: "invalid_request",
        error_description: "Bad request",
      };

      const mockHttpError = new HTTPError(
        createMockResponse(400, "Bad Request", mockErrorResponse),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.refreshToken("test-token")).rejects.toThrow(
        "HTTP error 400",
      );

      try {
        await service.refreshToken("test-token");
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("http_error");
      }
    });

    it("should throw DeviceFlowError on network error", async () => {
      const networkError = new Error("fetch failed: ECONNREFUSED");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(service.refreshToken("test-token")).rejects.toThrow(
        "Cannot connect to tunnel service",
      );

      try {
        await service.refreshToken("test-token");
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("network_error");
      }
    });

    it("should throw DeviceFlowError on timeout", async () => {
      const timeoutError = new TimeoutError(createMockRequest());

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(timeoutError),
      });

      await expect(service.refreshToken("test-token")).rejects.toThrow(
        "Request timeout. Please check your network connection.",
      );

      try {
        await service.refreshToken("test-token");
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("timeout");
      }
    });

    it("should throw DeviceFlowError on HTTP 500 error", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(500, "Internal Server Error"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.refreshToken("test-token")).rejects.toThrow(
        "Tunnel service error. Please try again later.",
      );

      try {
        await service.refreshToken("test-token");
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("server_error");
      }
    });

    it("should handle unparseable error responses", async () => {
      const mockHttpError = new HTTPError(
        {
          ...createMockResponse(400, "Bad Request"),
          json: () => Promise.reject(new Error("Parse error")),
        },
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.refreshToken("test-token")).rejects.toThrow(
        "HTTP error 400",
      );
    });

    it("should log errors via logger", async () => {
      const networkError = new Error("Test error");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(service.refreshToken("test-token")).rejects.toThrow();
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Error in refreshToken:",
        networkError,
      );
    });
  });

  describe("DeviceFlowError class", () => {
    it("should create error with message and code", () => {
      const error = new DeviceFlowError("Test message", "test_code");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(DeviceFlowError);
      expect(error.message).toBe("Test message");
      expect(error.code).toBe("test_code");
      expect(error.description).toBeUndefined();
      expect(error.name).toBe("DeviceFlowError");
    });

    it("should create error with message, code, and description", () => {
      const error = new DeviceFlowError(
        "Test message",
        "test_code",
        "Detailed description",
      );

      expect(error.message).toBe("Test message");
      expect(error.code).toBe("test_code");
      expect(error.description).toBe("Detailed description");
    });

    it("should be catchable as Error", () => {
      const error = new DeviceFlowError("Test", "test_code");

      try {
        throw error;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(DeviceFlowError);
        expect((e as DeviceFlowError).code).toBe("test_code");
      }
    });

    it("should preserve stack trace", () => {
      const error = new DeviceFlowError("Test", "test_code");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("DeviceFlowError");
    });

    it("should handle all expected error codes", () => {
      const errorCodes = [
        "authorization_pending",
        "slow_down",
        "expired_token",
        "access_denied",
        "invalid_grant",
        "network_error",
        "timeout",
        "auth_failed",
        "server_error",
        "http_error",
        "unknown_error",
      ];

      errorCodes.forEach((code) => {
        const error = new DeviceFlowError(`Error: ${code}`, code);
        expect(error.code).toBe(code);
        expect(error.name).toBe("DeviceFlowError");
      });
    });
  });

  describe("getConfig()", () => {
    it("should return correct configuration", () => {
      const config = service.getConfig();

      expect(config).toEqual({
        tunnelUrl: "wss://tunnel.ankimcp.ai",
        clientId: "ankimcp-cli",
      });
    });
  });

  describe("Error handling - edge cases", () => {
    it("should handle Error with network keyword", async () => {
      const networkError = new Error("network failure occurred");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Cannot connect to tunnel service",
      );
    });

    it("should handle unknown error types", async () => {
      const unknownError = { weird: "object" };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(unknownError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Unexpected error during requestDeviceCode",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("unknown_error");
      }
    });

    it("should re-throw DeviceFlowError without wrapping", async () => {
      const deviceFlowError = new DeviceFlowError(
        "Already a DeviceFlowError",
        "test_code",
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(deviceFlowError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        deviceFlowError,
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect(error).toBe(deviceFlowError); // Same instance
        expect((error as DeviceFlowError).code).toBe("test_code");
      }
    });

    it("should handle HTTP 401 Unauthorized", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(401, "Unauthorized"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Authentication failed. Invalid client configuration.",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("auth_failed");
      }
    });

    it("should handle HTTP 503 Service Unavailable", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(503, "Service Unavailable"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(service.requestDeviceCode()).rejects.toThrow(
        "Tunnel service error. Please try again later.",
      );

      try {
        await service.requestDeviceCode();
      } catch (error) {
        expect((error as DeviceFlowError).code).toBe("server_error");
      }
    });
  });
});
