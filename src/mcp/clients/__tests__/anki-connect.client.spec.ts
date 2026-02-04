import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import {
  AnkiConnectClient,
  AnkiConnectError,
  ReadOnlyModeError,
} from "../anki-connect.client";
import { ANKI_CONFIG } from "@/mcp/config/anki-config.interface";
import type { IAnkiConfig } from "@/mcp/config/anki-config.interface";
import ky, { HTTPError } from "ky";
import type { AnkiConnectResponse } from "@/mcp/types/anki.types";

// Mock ky module
jest.mock("ky", () => {
  const mockPost = jest.fn();
  const mockKyInstance = {
    post: mockPost,
  };
  const mockCreate = jest.fn(() => mockKyInstance);

  // Define MockHTTPError inside the factory
  class MockHTTPError extends Error {
    public response: any;
    public request: any;
    public options: any;

    constructor(response: any, request: any, options?: any) {
      // Mimic the real HTTPError message construction
      const code =
        response.status || response.status === 0 ? response.status : "";
      const title = response.statusText ?? "";
      const status = `${code} ${title}`.trim();
      const reason = status ? `status code ${status}` : "an unknown error";
      const message = `Request failed with ${reason}: ${request.method || "POST"} ${request.url || "http://localhost:8765"}`;

      super(message);
      this.name = "HTTPError";
      this.response = response;
      this.request = request;
      this.options = options;
    }
  }

  return {
    __esModule: true,
    default: {
      create: mockCreate,
    },
    HTTPError: MockHTTPError,
  };
});

describe("AnkiConnectClient", () => {
  let client: AnkiConnectClient;
  let mockKyInstance: any;
  let mockConfig: IAnkiConfig;
  let loggerSpy: jest.SpyInstance;

  // Helper function to create a mock Response object
  const createMockResponse = (status: number, statusText: string): Response => {
    const mockResponse = {
      status,
      statusText,
      headers: new Headers(),
      ok: status >= 200 && status < 300,
      redirected: false,
      type: "basic" as ResponseType,
      url: "http://localhost:8765",
      clone: () => mockResponse as Response,
      body: null,
      bodyUsed: false,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      blob: () => Promise.resolve(new Blob()),
      formData: () => Promise.resolve(new FormData()),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    } as Response;
    return mockResponse;
  };

  // Helper function to create a mock Request object
  const createMockRequest = (): Request => {
    return new Request("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  };

  // Helper function to create mock NormalizedOptions
  const createMockOptions = (): any => {
    return {
      method: "POST",
      retry: {
        limit: 2,
        methods: ["POST"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 3000,
      },
      prefixUrl: "http://localhost:8765",
      onDownloadProgress: () => {},
      onUploadProgress: () => {},
    };
  };

  beforeEach(async () => {
    // Setup default mock config
    mockConfig = {
      ankiConnectUrl: "http://localhost:8765",
      ankiConnectApiVersion: 6,
      ankiConnectTimeout: 5000,
    };

    // Clear all mocks before each test
    jest.clearAllMocks();

    // Get reference to the mock instance that ky.create returns
    // This is the same instance because our mock always returns the same object
    mockKyInstance = (ky as any).create();

    // Create module with config
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnkiConnectClient,
        {
          provide: ANKI_CONFIG,
          useValue: mockConfig,
        },
      ],
    }).compile();

    client = module.get<AnkiConnectClient>(AnkiConnectClient);

    // Setup logger spies
    loggerSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Constructor", () => {
    it("should initialize with default configuration", () => {
      expect(client).toBeDefined();
      expect((ky as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          prefixUrl: "http://localhost:8765",
          timeout: 5000,
          headers: {
            "Content-Type": "application/json",
          },
          retry: {
            limit: 2,
            methods: ["POST"],
            statusCodes: [408, 413, 429, 500, 502, 503, 504],
            backoffLimit: 3000,
          },
        }),
      );
    });

    it("should initialize with custom URL and timeout", async () => {
      const customConfig = {
        ankiConnectUrl: "http://custom-host:9999",
        ankiConnectApiVersion: 6,
        ankiConnectTimeout: 10000,
      };

      // Clear previous calls
      jest.clearAllMocks();

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: customConfig,
          },
        ],
      }).compile();

      module.get<AnkiConnectClient>(AnkiConnectClient);

      expect((ky as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          prefixUrl: "http://custom-host:9999",
          timeout: 10000,
        }),
      );
    });

    it("should initialize with API key when provided", async () => {
      const configWithKey = {
        ...mockConfig,
        ankiConnectApiKey: "test-api-key-123",
      };

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: configWithKey,
          },
        ],
      }).compile();

      const clientWithKey = module.get<AnkiConnectClient>(AnkiConnectClient);
      expect(clientWithKey).toBeDefined();
    });

    it("should configure retry logic correctly", () => {
      expect((ky as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          retry: {
            limit: 2,
            methods: ["POST"],
            statusCodes: [408, 413, 429, 500, 502, 503, 504],
            backoffLimit: 3000,
          },
        }),
      );
    });

    it("should configure hooks for logging", () => {
      // Get the most recent call to ky.create (from the client instantiation)
      const createCalls = ((ky as any).create as jest.Mock).mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);
      const createCall = createCalls[createCalls.length - 1][0];
      expect(createCall.hooks).toBeDefined();
      expect(createCall.hooks.beforeRequest).toHaveLength(1);
      expect(createCall.hooks.afterResponse).toHaveLength(1);
    });
  });

  describe("invoke() - Successful Requests", () => {
    it("should invoke simple action without parameters", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default", "Spanish", "French"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("deckNames");

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "deckNames",
          version: 6,
        },
      });
      expect(result).toEqual(["Default", "Spanish", "French"]);
      expect(loggerSpy).toHaveBeenCalledWith(
        "Invoking AnkiConnect action: deckNames",
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        "AnkiConnect action successful: deckNames",
      );
    });

    it("should invoke action with object parameters", async () => {
      const mockResponse: AnkiConnectResponse<number> = {
        result: 1234567890,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const params = {
        deckName: "Spanish",
        modelName: "Basic",
        fields: { Front: "hola", Back: "hello" },
      };

      const result = await client.invoke("addNote", params);

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "addNote",
          version: 6,
          params,
        },
      });
      expect(result).toBe(1234567890);
    });

    it("should invoke action with array parameters", async () => {
      const mockResponse: AnkiConnectResponse<any> = {
        result: { success: true },
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const params = {
        notes: [1234, 5678, 9012],
      };

      const result = await client.invoke("deleteNotes", params);

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "deleteNotes",
          version: 6,
          params,
        },
      });
      expect(result).toEqual({ success: true });
    });

    it("should invoke action with nested object parameters", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const params = {
        note: {
          id: 1234567890,
          fields: {
            Front: "updated front",
            Back: "updated back",
          },
          audio: [
            {
              url: "https://example.com/audio.mp3",
              filename: "audio.mp3",
              fields: ["Front"],
            },
          ],
        },
      };

      const result = await client.invoke("updateNoteFields", params);

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "updateNoteFields",
          version: 6,
          params,
        },
      });
      expect(result).toBeNull();
    });

    it("should invoke action with empty parameters object", async () => {
      const mockResponse: AnkiConnectResponse<string> = {
        result: "success",
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("sync", {});

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "sync",
          version: 6,
          params: {},
        },
      });
      expect(result).toBe("success");
    });

    it("should return null when result is null", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("guiShowAnswer");

      expect(result).toBeNull();
    });

    it("should return complex object result", async () => {
      const mockResponse: AnkiConnectResponse<any> = {
        result: {
          cardId: 123,
          deckName: "Spanish",
          fields: {
            Front: { value: "hola", order: 0 },
            Back: { value: "hello", order: 1 },
          },
        },
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("cardsInfo", { cards: [123] });

      expect(result).toEqual(mockResponse.result);
    });

    it("should invoke action with boolean parameters", async () => {
      const mockResponse: AnkiConnectResponse<any[]> = {
        result: [],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const params = {
        query: "deck:Spanish",
        reorderCards: {
          order: "ascending",
          columnId: "noteFld",
        },
      };

      const result = await client.invoke("guiBrowse", params);

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "guiBrowse",
          version: 6,
          params,
        },
      });
      expect(result).toEqual([]);
    });

    it("should return empty array result", async () => {
      const mockResponse: AnkiConnectResponse<any[]> = {
        result: [],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("findNotes", {
        query: "deck:NonExistent",
      });

      expect(result).toEqual([]);
    });

    it("should return numeric result", async () => {
      const mockResponse: AnkiConnectResponse<number> = {
        result: 42,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("getDueCardsCount");

      expect(result).toBe(42);
    });
  });

  describe("invoke() - API Key Handling", () => {
    it("should include API key in request when configured", async () => {
      const configWithKey: IAnkiConfig = {
        ...mockConfig,
        ankiConnectApiKey: "test-api-key-123",
      };

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: configWithKey,
          },
        ],
      }).compile();

      const clientWithKey = module.get<AnkiConnectClient>(AnkiConnectClient);

      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await clientWithKey.invoke("deckNames");

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "deckNames",
          version: 6,
          key: "test-api-key-123",
        },
      });
    });

    it("should not include key field when API key is not configured", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("deckNames");

      const callArg = mockKyInstance.post.mock.calls[0][1].json;
      expect(callArg).not.toHaveProperty("key");
    });

    it("should not include key field when API key is undefined", async () => {
      const configWithUndefinedKey: IAnkiConfig = {
        ...mockConfig,
        ankiConnectApiKey: undefined,
      };

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: configWithUndefinedKey,
          },
        ],
      }).compile();

      const clientWithUndefinedKey =
        module.get<AnkiConnectClient>(AnkiConnectClient);

      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await clientWithUndefinedKey.invoke("deckNames");

      const callArg = mockKyInstance.post.mock.calls[0][1].json;
      expect(callArg).not.toHaveProperty("key");
    });
  });

  describe("invoke() - AnkiConnect Errors", () => {
    it("should throw AnkiConnectError when response contains error", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: "collection is not available",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        AnkiConnectError,
      );
      await expect(client.invoke("deckNames")).rejects.toThrow(
        "AnkiConnect error: collection is not available",
      );

      try {
        await client.invoke("deckNames");
      } catch (error) {
        expect(error).toBeInstanceOf(AnkiConnectError);
        expect((error as AnkiConnectError).action).toBe("deckNames");
        expect((error as AnkiConnectError).originalError).toBe(
          "collection is not available",
        );
      }
    });

    it("should throw AnkiConnectError for invalid action", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: "unsupported action",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await expect(client.invoke("invalidAction")).rejects.toThrow(
        "AnkiConnect error: unsupported action",
      );

      try {
        await client.invoke("invalidAction");
      } catch (error) {
        expect((error as AnkiConnectError).action).toBe("invalidAction");
      }
    });

    it("should throw AnkiConnectError for model not found", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: "model was not found: NonExistent",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await expect(
        client.invoke("modelFieldNames", { modelName: "NonExistent" }),
      ).rejects.toThrow("AnkiConnect error: model was not found: NonExistent");
    });

    it("should throw AnkiConnectError for duplicate note", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: "cannot create note because it is a duplicate",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await expect(
        client.invoke("addNote", {
          deckName: "Default",
          modelName: "Basic",
          fields: { Front: "test", Back: "test" },
        }),
      ).rejects.toThrow(
        "AnkiConnect error: cannot create note because it is a duplicate",
      );
    });
  });

  describe("invoke() - HTTP Errors", () => {
    it("should throw AnkiConnectError for 403 Forbidden with permission message", async () => {
      // Create proper HTTPError instance using the mocked HTTPError class
      const mockHttpError = new HTTPError(
        createMockResponse(403, "Forbidden"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        AnkiConnectError,
      );
      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Permission denied. Please check AnkiConnect configuration and API key.",
      );

      try {
        await client.invoke("deckNames");
      } catch (error) {
        expect(error).toBeInstanceOf(AnkiConnectError);
        expect((error as AnkiConnectError).action).toBe("deckNames");
      }
    });

    it("should throw AnkiConnectError for 500 Internal Server Error", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(500, "Internal Server Error"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(client.invoke("sync")).rejects.toThrow(
        "HTTP error 500: Request failed with status code 500 Internal Server Error: POST http://localhost:8765/",
      );

      try {
        await client.invoke("sync");
      } catch (error) {
        expect((error as AnkiConnectError).action).toBe("sync");
      }
    });

    it("should throw AnkiConnectError for 502 Bad Gateway", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(502, "Bad Gateway"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "HTTP error 502: Request failed with status code 502 Bad Gateway: POST http://localhost:8765/",
      );
    });

    it("should throw AnkiConnectError for 503 Service Unavailable", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(503, "Service Unavailable"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "HTTP error 503: Request failed with status code 503 Service Unavailable: POST http://localhost:8765/",
      );
    });

    it("should throw AnkiConnectError for 504 Gateway Timeout", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(504, "Gateway Timeout"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "HTTP error 504: Request failed with status code 504 Gateway Timeout: POST http://localhost:8765/",
      );
    });

    it("should throw AnkiConnectError for 408 Request Timeout", async () => {
      const mockHttpError = new HTTPError(
        createMockResponse(408, "Request Timeout"),
        createMockRequest(),
        createMockOptions(),
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(mockHttpError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "HTTP error 408: Request failed with status code 408 Request Timeout: POST http://localhost:8765/",
      );
    });
  });

  describe("invoke() - Network Errors", () => {
    it("should throw AnkiConnectError for connection refused (fetch failed)", async () => {
      const networkError = new Error("fetch failed: ECONNREFUSED");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        AnkiConnectError,
      );
      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Cannot connect to Anki. Please ensure Anki is running and AnkiConnect plugin is installed.",
      );

      try {
        await client.invoke("deckNames");
      } catch (error) {
        expect((error as AnkiConnectError).action).toBe("deckNames");
      }
    });

    it("should throw AnkiConnectError for network timeout (fetch)", async () => {
      const networkError = new Error(
        "The operation was aborted due to timeout (fetch)",
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(client.invoke("sync")).rejects.toThrow(
        "Cannot connect to Anki. Please ensure Anki is running and AnkiConnect plugin is installed.",
      );
    });

    it("should throw AnkiConnectError for DNS resolution failure (fetch)", async () => {
      const networkError = new Error("getaddrinfo ENOTFOUND localhost (fetch)");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(networkError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Cannot connect to Anki. Please ensure Anki is running and AnkiConnect plugin is installed.",
      );
    });
  });

  describe("invoke() - Error Propagation", () => {
    it("should re-throw AnkiConnectError without wrapping", async () => {
      const ankiError = new AnkiConnectError(
        "AnkiConnect error: collection is not available",
        "deckNames",
        "collection is not available",
      );

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(ankiError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(ankiError);
      await expect(client.invoke("deckNames")).rejects.toThrow(
        AnkiConnectError,
      );

      try {
        await client.invoke("deckNames");
      } catch (error) {
        expect(error).toBe(ankiError); // Same instance
        expect((error as AnkiConnectError).action).toBe("deckNames");
      }
    });

    it("should wrap unknown Error instances", async () => {
      const unknownError = new Error("Something went wrong");

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(unknownError),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        AnkiConnectError,
      );
      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Unexpected error: Something went wrong",
      );

      try {
        await client.invoke("deckNames");
      } catch (error) {
        expect((error as AnkiConnectError).action).toBe("deckNames");
      }
    });

    it("should wrap non-Error thrown values as strings", async () => {
      const nonErrorValue = { code: "UNKNOWN", message: "Mystery error" };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(nonErrorValue),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        AnkiConnectError,
      );
      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Unexpected error:",
      );

      try {
        await client.invoke("deckNames");
      } catch (error) {
        expect((error as AnkiConnectError).message).toContain(
          "[object Object]",
        );
      }
    });

    it("should wrap string thrown values", async () => {
      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue("String error message"),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Unexpected error: String error message",
      );
    });

    it("should wrap null thrown values", async () => {
      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(null),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Unexpected error: null",
      );
    });

    it("should wrap undefined thrown values", async () => {
      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockRejectedValue(undefined),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow(
        "Unexpected error: undefined",
      );
    });
  });

  describe("invoke() - Edge Cases", () => {
    it("should handle action with undefined params (no params field)", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("deckNames", undefined);

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "deckNames",
          version: 6,
          params: undefined,
        },
      });
    });

    it("should handle response with extra fields", async () => {
      const mockResponse: any = {
        result: ["Default"],
        error: null,
        extraField: "should be ignored",
        anotherExtra: 123,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("deckNames");

      expect(result).toEqual(["Default"]);
    });

    it("should handle empty string error as falsy", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: "",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      // Empty string is falsy in JavaScript, so should NOT throw
      const result = await client.invoke("deckNames");
      expect(result).toBeNull();
    });

    it("should handle action with special characters", async () => {
      const mockResponse: AnkiConnectResponse<string> = {
        result: "success",
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("action::with::colons");

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "action::with::colons",
          version: 6,
        },
      });
    });

    it("should handle parameters with null values", async () => {
      const mockResponse: AnkiConnectResponse<any> = {
        result: { success: true },
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const params = {
        field1: "value",
        field2: null,
        field3: undefined,
      };

      await client.invoke("testAction", params);

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "testAction",
          version: 6,
          params,
        },
      });
    });

    it("should handle very large array results", async () => {
      const largeArray = Array.from({ length: 10000 }, (_, i) => i);
      const mockResponse: AnkiConnectResponse<number[]> = {
        result: largeArray,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("findNotes", { query: "deck:Huge" });

      expect(result).toHaveLength(10000);
      expect(result[0]).toBe(0);
      expect(result[9999]).toBe(9999);
    });

    it("should handle deeply nested object results", async () => {
      const deepObject = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  value: "deep",
                },
              },
            },
          },
        },
      };

      const mockResponse: AnkiConnectResponse<any> = {
        result: deepObject,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke("complexAction");

      expect(result.level1.level2.level3.level4.level5.value).toBe("deep");
    });
  });

  describe("invoke() - TypeScript Generic Support", () => {
    it("should support typed return values with generics", async () => {
      interface CustomResult {
        id: number;
        name: string;
      }

      const mockResponse: AnkiConnectResponse<CustomResult> = {
        result: { id: 123, name: "Test" },
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke<CustomResult>("customAction");

      expect(result.id).toBe(123);
      expect(result.name).toBe("Test");
    });

    it("should support array types with generics", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["a", "b", "c"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke<string[]>("getStrings");

      expect(result).toHaveLength(3);
      expect(result[0]).toBe("a");
    });

    it("should support null return type", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await client.invoke<null>("actionReturningNull");

      expect(result).toBeNull();
    });
  });

  describe("AnkiConnectError Class", () => {
    it("should create error with message only", () => {
      const error = new AnkiConnectError("Test error message");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AnkiConnectError);
      expect(error.message).toBe("Test error message");
      expect(error.name).toBe("AnkiConnectError");
      expect(error.action).toBeUndefined();
      expect(error.originalError).toBeUndefined();
    });

    it("should create error with action", () => {
      const error = new AnkiConnectError("Test error", "testAction");

      expect(error.message).toBe("Test error");
      expect(error.action).toBe("testAction");
      expect(error.originalError).toBeUndefined();
    });

    it("should create error with action and original error", () => {
      const error = new AnkiConnectError(
        "Test error",
        "testAction",
        "original error message",
      );

      expect(error.message).toBe("Test error");
      expect(error.action).toBe("testAction");
      expect(error.originalError).toBe("original error message");
    });

    it("should have correct error name", () => {
      const error = new AnkiConnectError("Test");
      expect(error.name).toBe("AnkiConnectError");
    });

    it("should be catchable as Error", () => {
      const error = new AnkiConnectError("Test");

      try {
        throw error;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(AnkiConnectError);
      }
    });

    it("should preserve stack trace", () => {
      const error = new AnkiConnectError("Test");
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain("AnkiConnectError");
    });
  });

  describe("ReadOnlyModeError Class", () => {
    it("should create error with action name", () => {
      const error = new ReadOnlyModeError("addNote");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ReadOnlyModeError);
      expect(error.name).toBe("ReadOnlyModeError");
      expect(error.action).toBe("addNote");
      expect(error.message).toContain("addNote");
      expect(error.message).toContain("read-only mode");
    });

    it("should include helpful message about removing flag", () => {
      const error = new ReadOnlyModeError("sync");

      expect(error.message).toContain("--read-only");
      expect(error.message).toContain("Remove the --read-only flag");
    });

    it("should be catchable as Error", () => {
      const error = new ReadOnlyModeError("deleteNotes");

      try {
        throw error;
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
        expect(e).toBeInstanceOf(ReadOnlyModeError);
      }
    });
  });

  describe("invoke() - Read-Only Mode", () => {
    let readOnlyClient: AnkiConnectClient;

    beforeEach(async () => {
      const readOnlyConfig: IAnkiConfig = {
        ...mockConfig,
        readOnly: true,
      };

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: readOnlyConfig,
          },
        ],
      }).compile();

      readOnlyClient = module.get<AnkiConnectClient>(AnkiConnectClient);
    });

    describe("should block write actions", () => {
      // Only actions actually exposed by our tools
      const writeActions = [
        // Note operations
        { action: "addNote", params: { note: {} } },
        { action: "updateNoteFields", params: { note: { id: 1 } } },
        { action: "deleteNotes", params: { notes: [] } },
        // Deck operations
        { action: "createDeck", params: { deck: "Test" } },
        { action: "changeDeck", params: { cards: [], deck: "Test" } },
        // Tag operations
        { action: "addTags", params: { notes: [], tags: "" } },
        { action: "removeTags", params: { notes: [], tags: "" } },
        { action: "clearUnusedTags", params: {} },
        { action: "replaceTags", params: {} },
        // Media operations
        { action: "storeMediaFile", params: { filename: "", data: "" } },
        { action: "deleteMediaFile", params: { filename: "" } },
        // Model operations
        { action: "createModel", params: { modelName: "Test" } },
        { action: "updateModelStyling", params: { model: {} } },
      ];

      it.each(writeActions)(
        'should block "$action" in read-only mode',
        async ({ action, params }) => {
          await expect(readOnlyClient.invoke(action, params)).rejects.toThrow(
            ReadOnlyModeError,
          );
          await expect(readOnlyClient.invoke(action, params)).rejects.toThrow(
            `Action "${action}" is blocked`,
          );
        },
      );
    });

    describe("should allow read actions", () => {
      const readActions = [
        { action: "deckNames", result: ["Default"] },
        { action: "modelNames", result: ["Basic"] },
        { action: "findNotes", result: [1, 2, 3] },
        { action: "notesInfo", result: [] },
        { action: "cardsInfo", result: [] },
        { action: "getDeckStats", result: {} },
        { action: "getNumCardsReviewedToday", result: 10 },
        { action: "modelFieldNames", result: ["Front", "Back"] },
        { action: "modelStyling", result: { css: "" } },
        { action: "guiBrowse", result: [] },
        { action: "guiCurrentCard", result: null },
        { action: "guiShowQuestion", result: true },
        { action: "guiShowAnswer", result: true },
        // Review/scheduling operations are allowed (read-only protects content, not review state)
        { action: "sync", result: null },
        { action: "suspend", result: true },
        { action: "unsuspend", result: true },
        { action: "answerCards", result: [true] },
        { action: "forgetCards", result: null },
        { action: "relearnCards", result: null },
        { action: "guiAnswerCard", result: true },
        { action: "guiSelectNote", result: true },
        { action: "guiAddCards", result: 123 },
      ];

      it.each(readActions)(
        'should allow "$action" in read-only mode',
        async ({ action, result }) => {
          const mockResponse: AnkiConnectResponse<any> = {
            result,
            error: null,
          };

          mockKyInstance.post.mockReturnValue({
            json: jest.fn().mockResolvedValue(mockResponse),
          });

          const response = await readOnlyClient.invoke(action);
          expect(response).toEqual(result);
        },
      );
    });

    it("should not block actions when readOnly is false", async () => {
      const mockResponse: AnkiConnectResponse<number> = {
        result: 123,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      // Using the default client (readOnly: false/undefined)
      const result = await client.invoke("addNote", {
        note: { deckName: "Test", modelName: "Basic", fields: {} },
      });

      expect(result).toBe(123);
    });

    it("should not block actions when readOnly is undefined", async () => {
      const configWithoutReadOnly: IAnkiConfig = {
        ankiConnectUrl: "http://localhost:8765",
        ankiConnectApiVersion: 6,
        ankiConnectTimeout: 5000,
        // readOnly not specified
      };

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: configWithoutReadOnly,
          },
        ],
      }).compile();

      const clientWithoutReadOnly =
        module.get<AnkiConnectClient>(AnkiConnectClient);

      const mockResponse: AnkiConnectResponse<number> = {
        result: 456,
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      const result = await clientWithoutReadOnly.invoke("addNote", {
        note: {},
      });
      expect(result).toBe(456);
    });

    it("should re-throw ReadOnlyModeError without wrapping", async () => {
      await expect(readOnlyClient.invoke("addNote", {})).rejects.toBeInstanceOf(
        ReadOnlyModeError,
      );

      try {
        await readOnlyClient.invoke("addNote", {});
      } catch (error) {
        expect(error).toBeInstanceOf(ReadOnlyModeError);
        expect((error as ReadOnlyModeError).action).toBe("addNote");
        // Ensure it's not wrapped in AnkiConnectError
        expect(error).not.toBeInstanceOf(AnkiConnectError);
      }
    });

    it("should log warning when blocking write action", async () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn");

      await expect(
        readOnlyClient.invoke("deleteNotes", { notes: [] }),
      ).rejects.toThrow();

      expect(warnSpy).toHaveBeenCalledWith(
        'Blocked write action "deleteNotes" in read-only mode',
      );
    });
  });

  describe("Logging Behavior", () => {
    it("should log action invocation", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("deckNames");

      expect(loggerSpy).toHaveBeenCalledWith(
        "Invoking AnkiConnect action: deckNames",
      );
    });

    it("should log successful action completion", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: ["Default"],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("deckNames");

      expect(loggerSpy).toHaveBeenCalledWith(
        "AnkiConnect action successful: deckNames",
      );
    });

    it("should not log success message when error occurs", async () => {
      const mockResponse: AnkiConnectResponse<null> = {
        result: null,
        error: "test error",
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await expect(client.invoke("deckNames")).rejects.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        "Invoking AnkiConnect action: deckNames",
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        "AnkiConnect action successful: deckNames",
      );
    });

    it("should trigger beforeRequest hook logging", async () => {
      const mockResponse: AnkiConnectResponse<string[]> = {
        result: [],
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("deckNames");

      // The hook should have been configured (tested in constructor tests)
      expect((ky as any).create).toHaveBeenCalledWith(
        expect.objectContaining({
          hooks: expect.objectContaining({
            beforeRequest: expect.any(Array),
          }),
        }),
      );
    });
  });

  describe("Request Formatting", () => {
    it("should format request with correct structure", async () => {
      const mockResponse: AnkiConnectResponse<any> = {
        result: {},
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("testAction", { param1: "value1" });

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "testAction",
          version: 6,
          params: { param1: "value1" },
        },
      });
    });

    it("should use configured API version", async () => {
      const customConfig: IAnkiConfig = {
        ankiConnectUrl: "http://localhost:8765",
        ankiConnectApiVersion: 7, // Custom version
        ankiConnectTimeout: 5000,
      };

      const module = await Test.createTestingModule({
        providers: [
          AnkiConnectClient,
          {
            provide: ANKI_CONFIG,
            useValue: customConfig,
          },
        ],
      }).compile();

      const customClient = module.get<AnkiConnectClient>(AnkiConnectClient);

      const mockResponse: AnkiConnectResponse<any> = {
        result: {},
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await customClient.invoke("testAction");

      expect(mockKyInstance.post).toHaveBeenCalledWith("", {
        json: {
          action: "testAction",
          version: 7, // Should use custom version
        },
      });
    });

    it("should post to empty string endpoint", async () => {
      const mockResponse: AnkiConnectResponse<any> = {
        result: {},
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("testAction");

      expect(mockKyInstance.post).toHaveBeenCalledWith(
        "", // Empty string endpoint
        expect.any(Object),
      );
    });

    it("should include params only when provided", async () => {
      const mockResponse: AnkiConnectResponse<any> = {
        result: {},
        error: null,
      };

      mockKyInstance.post.mockReturnValue({
        json: jest.fn().mockResolvedValue(mockResponse),
      });

      await client.invoke("noParamsAction");

      const callArg = mockKyInstance.post.mock.calls[0][1].json;
      expect(callArg.action).toBe("noParamsAction");
      expect(callArg.version).toBe(6);
      // params is undefined, not included or is undefined
    });
  });
});
