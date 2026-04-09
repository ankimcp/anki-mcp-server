import { Test, TestingModule } from "@nestjs/testing";
import { MediaActionsTool } from "../mediaActions.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import * as dns from "node:dns";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

// Mock dns.promises.lookup for URL validation tests
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

describe("MediaActionsTool", () => {
  let tool: MediaActionsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MediaActionsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<MediaActionsTool>(MediaActionsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

    // Default: resolve to a public IP so existing URL tests pass
    mockLookup.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    } as any);

    // Clear all mocks before each test
    jest.clearAllMocks();

    // Re-apply default after clearAllMocks
    mockLookup.mockResolvedValue({
      address: "93.184.216.34",
      family: 4,
    } as any);
  });

  describe("storeMediaFile action", () => {
    it("should store media file with base64 data", async () => {
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "test_audio.mp3",
        data: "base64EncodedData==",
        deleteExisting: true,
      };
      ankiClient.invoke.mockResolvedValueOnce("test_audio.mp3");

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
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
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "image.jpg",
        path: "/absolute/path/to/image.jpg",
      };
      ankiClient.invoke.mockResolvedValueOnce("image.jpg");

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("storeMediaFile", {
        filename: "image.jpg",
        path: "/absolute/path/to/image.jpg",
        deleteExisting: true,
      });
      expect(result.success).toBe(true);
      expect(result.filename).toBe("image.jpg");
    });

    it("should store media file with URL", async () => {
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "remote.mp3",
        url: "https://example.com/audio.mp3",
      };
      ankiClient.invoke.mockResolvedValueOnce("remote.mp3");

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("storeMediaFile", {
        filename: "remote.mp3",
        url: "https://example.com/audio.mp3",
        deleteExisting: true,
      });
      expect(result.success).toBe(true);
    });

    it("should detect underscore prefix in filename", async () => {
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "_preserved_audio.mp3",
        data: "base64Data",
      };
      ankiClient.invoke.mockResolvedValueOnce("_preserved_audio.mp3");

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.prefixedWithUnderscore).toBe(true);
    });

    it("should handle store failure", async () => {
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "test.mp3",
        data: "base64",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to store media file");
    });
  });

  describe("retrieveMediaFile action", () => {
    it("should retrieve existing media file", async () => {
      // Arrange
      const params = {
        action: "retrieveMediaFile" as const,
        filename: "existing.mp3",
      };
      ankiClient.invoke.mockResolvedValueOnce("base64EncodedFileContent==");

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("retrieveMediaFile", {
        filename: "existing.mp3",
      });
      expect(result.success).toBe(true);
      expect(result.filename).toBe("existing.mp3");
      expect(result.data).toBe("base64EncodedFileContent==");
      expect(result.found).toBe(true);
    });

    it("should handle non-existent file", async () => {
      // Arrange
      const params = {
        action: "retrieveMediaFile" as const,
        filename: "nonexistent.mp3",
      };
      ankiClient.invoke.mockResolvedValueOnce(false);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.found).toBe(false);
      expect(result.data).toBeNull();
      expect(result.message).toContain("not found");
    });
  });

  describe("getMediaFilesNames action", () => {
    it("should list all media files without pattern", async () => {
      // Arrange
      const params = {
        action: "getMediaFilesNames" as const,
      };
      const mockFiles = ["audio1.mp3", "audio2.mp3", "image1.jpg"];
      ankiClient.invoke.mockResolvedValueOnce(mockFiles);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("getMediaFilesNames", {});
      expect(result.success).toBe(true);
      expect(result.files).toEqual(mockFiles);
      expect(result.count).toBe(3);
    });

    it("should list media files with pattern", async () => {
      // Arrange
      const params = {
        action: "getMediaFilesNames" as const,
        pattern: "*.mp3",
      };
      const mockFiles = ["audio1.mp3", "audio2.mp3"];
      ankiClient.invoke.mockResolvedValueOnce(mockFiles);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("getMediaFilesNames", {
        pattern: "*.mp3",
      });
      expect(result.success).toBe(true);
      expect(result.files).toEqual(mockFiles);
      expect(result.count).toBe(2);
      expect(result.pattern).toBe("*.mp3");
    });

    it("should handle empty file list", async () => {
      // Arrange
      const params = {
        action: "getMediaFilesNames" as const,
      };
      ankiClient.invoke.mockResolvedValueOnce([]);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.files).toEqual([]);
      expect(result.count).toBe(0);
    });
  });

  describe("deleteMediaFile action", () => {
    it("should delete media file", async () => {
      // Arrange
      const params = {
        action: "deleteMediaFile" as const,
        filename: "old_audio.mp3",
      };
      ankiClient.invoke.mockResolvedValueOnce(undefined);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("deleteMediaFile", {
        filename: "old_audio.mp3",
      });
      expect(result.success).toBe(true);
      expect(result.filename).toBe("old_audio.mp3");
      expect(result.message).toContain("Successfully deleted");
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "test.mp3",
        data: "base64",
      };
      ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });

  describe("progress reporting", () => {
    it("should report progress for storeMediaFile", async () => {
      // Arrange
      const params = {
        action: "storeMediaFile" as const,
        filename: "test.mp3",
        data: "base64",
      };
      ankiClient.invoke.mockResolvedValueOnce("test.mp3");

      // Act
      await tool.execute(params, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });

    it("should report progress for retrieveMediaFile", async () => {
      // Arrange
      const params = {
        action: "retrieveMediaFile" as const,
        filename: "test.mp3",
      };
      ankiClient.invoke.mockResolvedValueOnce("base64Data");

      // Act
      await tool.execute(params, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });
  });

  // ── Security guards ────────────────────────────────────────────────────────
  // These tests verify that the validation utilities from media-validation.utils
  // are actually wired into the tool execution paths, not just tested in isolation.

  describe("security guards", () => {
    describe("storeMediaFile path validation", () => {
      it("should reject non-media file paths (e.g., .ssh/id_rsa)", async () => {
        const params = {
          action: "storeMediaFile" as const,
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
          action: "storeMediaFile" as const,
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
          action: "storeMediaFile" as const,
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
          // PDF is not allowed by default
          const params = {
            action: "storeMediaFile" as const,
            filename: "doc.pdf",
            path: "/docs/manual.pdf",
          };

          // First: without env var, PDF should be rejected
          const rawResultBlocked = await tool.execute(params, mockContext);
          const resultBlocked = parseToolResult(rawResultBlocked);
          expect(resultBlocked.success).toBe(false);
          expect(resultBlocked.error).toContain("Only media files");

          // Now allow PDF via env var
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

          // A file outside the allowed directory should be rejected
          const params = {
            action: "storeMediaFile" as const,
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

    describe("storeMediaFile URL validation", () => {
      it("should reject file:// URLs", async () => {
        const params = {
          action: "storeMediaFile" as const,
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
          action: "storeMediaFile" as const,
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
          action: "storeMediaFile" as const,
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
          // Resolve to a private IP — normally blocked
          mockLookup.mockResolvedValue({
            address: "192.168.1.100",
            family: 4,
          } as any);

          const params = {
            action: "storeMediaFile" as const,
            filename: "internal.mp3",
            url: "https://my-nas.local/audio.mp3",
          };

          // First: without MEDIA_ALLOWED_HOSTS, should be blocked
          const rawResultBlocked = await tool.execute(params, mockContext);
          const resultBlocked = parseToolResult(rawResultBlocked);
          expect(resultBlocked.success).toBe(false);
          expect(resultBlocked.error).toContain("private/internal networks");

          // Now allow the host
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

    describe("storeMediaFile filename sanitization", () => {
      it("sanitizes path traversal in filename for storeMediaFile", async () => {
        const tool = new MediaActionsTool(ankiClient as any);
        ankiClient.invoke.mockResolvedValue("safe_name.jpg");

        await tool.execute(
          {
            action: "storeMediaFile",
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
        const tool = new MediaActionsTool(ankiClient as any);
        ankiClient.invoke.mockResolvedValue("image.jpg");

        await tool.execute(
          {
            action: "storeMediaFile",
            filename: "image.jpg",
            path: "/photos/../photos/image.jpg",
          },
          mockContext,
        );

        // The resolved path should not contain ../
        const invokeCall = ankiClient.invoke.mock.calls[0];
        expect(invokeCall[1].path).not.toContain("..");
      });
    });

    describe("storeMediaFile cloud metadata protection", () => {
      it("blocks cloud metadata endpoint (169.254.169.254)", async () => {
        mockLookup.mockResolvedValue({
          address: "169.254.169.254",
          family: 4,
        } as any);
        const tool = new MediaActionsTool(ankiClient as any);

        const result = await tool.execute(
          {
            action: "storeMediaFile",
            filename: "metadata.txt",
            url: "http://169.254.169.254/latest/meta-data/",
          },
          mockContext,
        );

        expect(result).toHaveProperty("isError", true);
        expect(ankiClient.invoke).not.toHaveBeenCalled();
      });
    });

    describe("retrieveMediaFile filename sanitization", () => {
      it("should sanitize path traversal in filename", async () => {
        const params = {
          action: "retrieveMediaFile" as const,
          filename: "../../.bashrc",
        };
        ankiClient.invoke.mockResolvedValueOnce("file-contents-base64");

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        // The sanitized filename should have traversal sequences stripped
        expect(ankiClient.invoke).toHaveBeenCalledWith("retrieveMediaFile", {
          filename: ".bashrc",
        });
        expect(result.success).toBe(true);
        expect(result.filename).toBe(".bashrc");
      });

      it("should pass normal filenames through unchanged", async () => {
        const params = {
          action: "retrieveMediaFile" as const,
          filename: "pronunciation.mp3",
        };
        ankiClient.invoke.mockResolvedValueOnce("base64data");

        await tool.execute(params, mockContext);

        expect(ankiClient.invoke).toHaveBeenCalledWith("retrieveMediaFile", {
          filename: "pronunciation.mp3",
        });
      });
    });

    describe("deleteMediaFile filename sanitization", () => {
      it("should sanitize path traversal in filename", async () => {
        const params = {
          action: "deleteMediaFile" as const,
          filename: "../../etc/passwd",
        };
        ankiClient.invoke.mockResolvedValueOnce(undefined);

        const rawResult = await tool.execute(params, mockContext);
        const result = parseToolResult(rawResult);

        // Path traversal sequences and separators are stripped
        expect(ankiClient.invoke).toHaveBeenCalledWith("deleteMediaFile", {
          filename: "etcpasswd",
        });
        expect(result.success).toBe(true);
        expect(result.filename).toBe("etcpasswd");
      });

      it("should pass normal filenames through unchanged", async () => {
        const params = {
          action: "deleteMediaFile" as const,
          filename: "old_recording.mp3",
        };
        ankiClient.invoke.mockResolvedValueOnce(undefined);

        await tool.execute(params, mockContext);

        expect(ankiClient.invoke).toHaveBeenCalledWith("deleteMediaFile", {
          filename: "old_recording.mp3",
        });
      });
    });
  });
});
