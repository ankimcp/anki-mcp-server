import { Test, TestingModule } from "@nestjs/testing";
import { StoreMediaFileTool } from "../store-media-file.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import * as dns from "node:dns";

jest.mock("@/mcp/clients/anki-connect.client");

jest.mock("node:dns", () => {
  const actual = jest.requireActual("node:dns");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: jest.fn(),
    },
  };
});

const mockLookup = dns.promises.lookup as jest.MockedFunction<
  typeof dns.promises.lookup
>;

describe("StoreMediaFileTool", () => {
  let tool: StoreMediaFileTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoreMediaFileTool, AnkiConnectClient],
    }).compile();

    tool = module.get<StoreMediaFileTool>(StoreMediaFileTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();

    mockLookup.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    } as any);

    jest.clearAllMocks();

    mockLookup.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    } as any);
  });

  it("should store media file with base64 data", async () => {
    const params = {
      filename: "test_audio.mp3",
      data: "base64EncodedData==",
      deleteExisting: true,
    };
    ankiClient.invoke.mockResolvedValueOnce("test_audio.mp3");

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("storeMediaFile", {
      filename: "test_audio.mp3",
      data: "base64EncodedData==",
      deleteExisting: true,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe("test_audio.mp3");
    expect(result.prefixedWithUnderscore).toBe(false);
  });

  it("should store media file with file path", async () => {
    const params = {
      filename: "image.jpg",
      path: "/absolute/path/to/image.jpg",
    };
    ankiClient.invoke.mockResolvedValueOnce("image.jpg");

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("storeMediaFile", {
      filename: "image.jpg",
      path: "/absolute/path/to/image.jpg",
      deleteExisting: true,
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe("image.jpg");
  });

  it("should store media file with URL", async () => {
    const params = {
      filename: "remote.mp3",
      url: "https://example.com/audio.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce("remote.mp3");

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("storeMediaFile", {
      filename: "remote.mp3",
      url: "https://example.com/audio.mp3",
      deleteExisting: true,
    });
    expect(result.success).toBe(true);
  });

  it("should detect underscore prefix in filename", async () => {
    const params = {
      filename: "_preserved_audio.mp3",
      data: "base64Data",
    };
    ankiClient.invoke.mockResolvedValueOnce("_preserved_audio.mp3");

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.prefixedWithUnderscore).toBe(true);
  });

  it("should handle store failure", async () => {
    const params = {
      filename: "test.mp3",
      data: "base64",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to store media file");
  });

  it("should handle network errors", async () => {
    const params = {
      filename: "test.mp3",
      data: "base64",
    };
    ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should report progress", async () => {
    const params = {
      filename: "test.mp3",
      data: "base64",
    };
    ankiClient.invoke.mockResolvedValueOnce("test.mp3");

    await tool.execute(params, mockContext);

    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 25,
      total: 100,
    });
    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 100,
      total: 100,
    });
  });

  describe("security guards", () => {
    describe("path validation", () => {
      it("should reject non-media file paths (e.g., .ssh/id_rsa)", async () => {
        const params = {
          filename: "stolen.txt",
          path: "/home/user/.ssh/id_rsa",
        };

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Only media files");
        expect(ankiClient.invoke).not.toHaveBeenCalled();
      });

      it("should reject .env files", async () => {
        const params = {
          filename: "secrets.txt",
          path: "/home/user/.env",
        };

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        expect(result.success).toBe(false);
        expect(result.error).toContain("Only media files");
        expect(ankiClient.invoke).not.toHaveBeenCalled();
      });

      it("should allow media file paths (e.g., /photos/cat.jpg)", async () => {
        const params = {
          filename: "cat.jpg",
          path: "/photos/cat.jpg",
        };
        ankiClient.invoke.mockResolvedValueOnce("cat.jpg");

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        expect(result.success).toBe(true);
        expect(ankiClient.invoke).toHaveBeenCalledWith(
          "storeMediaFile",
          expect.objectContaining({ path: "/photos/cat.jpg" }),
        );
      });

      it("should respect MEDIA_ALLOWED_TYPES env var", async () => {
        const originalEnv = process.env.MEDIA_ALLOWED_TYPES;
        try {
          const params = {
            filename: "doc.pdf",
            path: "/docs/manual.pdf",
          };

          const rawResultBlocked = await tool.execute(params, mockContext);
          const resultBlocked = parseToolResult(rawResultBlocked);
          expect(resultBlocked.success).toBe(false);
          expect(resultBlocked.error).toContain("Only media files");

          process.env.MEDIA_ALLOWED_TYPES = "application/pdf";
          ankiClient.invoke.mockResolvedValueOnce("doc.pdf");

          const rawResultAllowed = await tool.execute(params, mockContext);
          const resultAllowed = parseToolResult(rawResultAllowed);
          expect(resultAllowed.success).toBe(true);
          expect(ankiClient.invoke).toHaveBeenCalled();
        } finally {
          if (originalEnv === undefined) {
            delete process.env.MEDIA_ALLOWED_TYPES;
          } else {
            process.env.MEDIA_ALLOWED_TYPES = originalEnv;
          }
        }
      });

      it("should respect MEDIA_IMPORT_DIR env var", async () => {
        const originalEnv = process.env.MEDIA_IMPORT_DIR;
        try {
          process.env.MEDIA_IMPORT_DIR = "/allowed/media";

          const params = {
            filename: "cat.jpg",
            path: "/other/directory/cat.jpg",
          };

          const rawResult = await tool.execute(params, mockContext);
          const result = parseToolResult(rawResult);

          expect(result.success).toBe(false);
          expect(result.error).toContain(
            "outside the allowed import directory",
          );
          expect(ankiClient.invoke).not.toHaveBeenCalled();
        } finally {
          if (originalEnv === undefined) {
            delete process.env.MEDIA_IMPORT_DIR;
          } else {
            process.env.MEDIA_IMPORT_DIR = originalEnv;
          }
        }
      });
    });

    describe("URL validation", () => {
      it("should reject file:// URLs", async () => {
        const params = {
          filename: "stolen.mp3",
          url: "file:///etc/passwd",
        };

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        expect(result.success).toBe(false);
        expect(result.error).toContain('URL scheme "file" is not allowed');
        expect(ankiClient.invoke).not.toHaveBeenCalled();
      });

      it("should reject URLs resolving to private IPs", async () => {
        mockLookup.mockResolvedValueOnce({
          address: "192.168.1.100",
          family: 4,
        } as any);

        const params = {
          filename: "internal.mp3",
          url: "https://internal-server.local/audio.mp3",
        };

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        expect(result.success).toBe(false);
        expect(result.error).toContain(
          "requests to private/internal networks are not allowed",
        );
        expect(ankiClient.invoke).not.toHaveBeenCalled();
      });

      it("should allow URLs resolving to public IPs", async () => {
        mockLookup.mockResolvedValueOnce({
          address: "93.184.216.34",
          family: 4,
        } as any);

        const params = {
          filename: "public.mp3",
          url: "https://cdn.example.com/audio.mp3",
        };
        ankiClient.invoke.mockResolvedValueOnce("public.mp3");

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        expect(result.success).toBe(true);
        expect(ankiClient.invoke).toHaveBeenCalledWith(
          "storeMediaFile",
          expect.objectContaining({ url: "https://cdn.example.com/audio.mp3" }),
        );
      });

      it("should respect MEDIA_ALLOWED_HOSTS env var", async () => {
        const originalEnv = process.env.MEDIA_ALLOWED_HOSTS;
        try {
          mockLookup.mockResolvedValue({
            address: "192.168.1.100",
            family: 4,
          } as any);

          const params = {
            filename: "internal.mp3",
            url: "https://my-nas.local/audio.mp3",
          };

          const rawResultBlocked = await tool.execute(params, mockContext);
          const resultBlocked = parseToolResult(rawResultBlocked);
          expect(resultBlocked.success).toBe(false);
          expect(resultBlocked.error).toContain("private/internal networks");

          process.env.MEDIA_ALLOWED_HOSTS = "my-nas.local";
          ankiClient.invoke.mockResolvedValueOnce("internal.mp3");

          const rawResultAllowed = await tool.execute(params, mockContext);
          const resultAllowed = parseToolResult(rawResultAllowed);
          expect(resultAllowed.success).toBe(true);
        } finally {
          if (originalEnv === undefined) {
            delete process.env.MEDIA_ALLOWED_HOSTS;
          } else {
            process.env.MEDIA_ALLOWED_HOSTS = originalEnv;
          }
        }
      });
    });

    describe("filename sanitization", () => {
      it("sanitizes path traversal in filename", async () => {
        ankiClient.invoke.mockResolvedValue("safe_name.jpg");

        await tool.execute(
          {
            filename: "../../evil.jpg",
            data: "base64data",
          },
          mockContext,
        );

        expect(ankiClient.invoke).toHaveBeenCalledWith(
          "storeMediaFile",
          expect.objectContaining({ filename: "evil.jpg" }),
        );
      });

      it("sends resolved path to AnkiConnect, not original path", async () => {
        ankiClient.invoke.mockResolvedValue("image.jpg");

        await tool.execute(
          {
            filename: "image.jpg",
            path: "/photos/../photos/image.jpg",
          },
          mockContext,
        );

        expect(ankiClient.invoke).toHaveBeenCalledWith(
          "storeMediaFile",
          expect.objectContaining({
            path: expect.not.stringContaining(".."),
          }),
        );
      });
    });

    describe("cloud metadata protection", () => {
      it("blocks cloud metadata endpoint (169.254.169.254)", async () => {
        mockLookup.mockResolvedValue({
          address: "169.254.169.254",
          family: 4,
        } as any);

        const result = await tool.execute(
          {
            filename: "metadata.txt",
            url: "http://169.254.169.254/latest/meta-data/",
          },
          mockContext,
        );

        expect(result).toHaveProperty("isError", true);
        expect(ankiClient.invoke).not.toHaveBeenCalled();
      });
    });
  });
});
