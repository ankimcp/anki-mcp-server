/**
 * E2E tests for media security validation - STDIO transport
 *
 * Verifies that path traversal, SSRF, and filename sanitization
 * guards work end-to-end through the full MCP protocol stack.
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - Built project: npm run build
 */
import { callTool, setTransport, getTransport } from "./helpers";

describe("E2E: Media Security Guards (STDIO)", () => {
  beforeAll(() => {
    setTransport("stdio");
    expect(getTransport()).toBe("stdio");
  });

  describe("Path traversal protection", () => {
    it("should block non-media file paths (SSH key)", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "stolen_key",
        path: "/home/user/.ssh/id_rsa",
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("File type not allowed");
      expect(result.error).toContain("MEDIA_ALLOWED_TYPES");
    });

    it("should block .env files", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "stolen_env",
        path: "/home/user/.env",
      });
      expect(result).toHaveProperty("success", false);
      expect(result.error).toContain("File type not allowed");
    });

    it("should block /etc/passwd", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "passwd",
        path: "/etc/passwd",
      });
      expect(result).toHaveProperty("success", false);
      expect(result.error).toContain("File type not allowed");
    });

    it("should block files with no extension", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "credentials",
        path: "/home/user/.aws/credentials",
      });
      expect(result).toHaveProperty("success", false);
      expect(result.error).toContain("File type not allowed");
    });

    // Null byte injection is tested at unit level (media-validation.utils.spec.ts).
    // Node.js rejects null bytes in execFileSync args before they reach the MCP transport,
    // so this vector cannot be tested E2E.
  });

  describe("SSRF protection", () => {
    it("should block file:// URLs", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "ssrf_test",
        url: "file:///etc/passwd",
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("scheme");
      expect(result.error).toContain("not allowed");
    });

    it("should block ftp:// URLs", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "ftp_test",
        url: "ftp://evil.com/file.txt",
      });
      expect(result).toHaveProperty("success", false);
      expect(result.error).toContain("scheme");
    });

    it("should block cloud metadata endpoint (169.254.169.254)", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "metadata",
        url: "http://169.254.169.254/latest/meta-data/",
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("private/internal networks");
    });

    it("should block localhost URLs", () => {
      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "localhost_test",
        url: "http://127.0.0.1:6379/",
      });
      expect(result).toHaveProperty("success", false);
      expect(result.error).toContain("private/internal networks");
    });
  });

  describe("Legitimate operations still work", () => {
    it("should allow listing media files", () => {
      const result = callTool("mediaActions", {
        action: "getMediaFilesNames",
      });
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("files");
      expect(Array.isArray(result.files)).toBe(true);
    });

    it("should allow storing media via base64", () => {
      // Store a tiny valid PNG (1x1 pixel)
      const tinyPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "_e2e_security_test.png",
        data: tinyPng,
      });
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("filename", "_e2e_security_test.png");
    });

    it("should allow retrieving stored media", () => {
      const result = callTool("mediaActions", {
        action: "retrieveMediaFile",
        filename: "_e2e_security_test.png",
      });
      expect(result).toHaveProperty("success", true);
      expect(result).toHaveProperty("found", true);
      expect(result).toHaveProperty("data");
    });

    it("should clean up test media file", () => {
      const result = callTool("mediaActions", {
        action: "deleteMediaFile",
        filename: "_e2e_security_test.png",
      });
      expect(result).toHaveProperty("success", true);
    });
  });

  describe("Filename sanitization", () => {
    it("should sanitize path traversal in filenames when storing", () => {
      const tinyPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const result = callTool("mediaActions", {
        action: "storeMediaFile",
        filename: "../../evil.png",
        data: tinyPng,
      });
      // Should succeed but with sanitized filename (no ../)
      expect(result).toHaveProperty("success", true);
      expect(result.filename).not.toContain("..");
      expect(result.filename).not.toContain("/");
    });

    it("should clean up sanitized test file", () => {
      const result = callTool("mediaActions", {
        action: "deleteMediaFile",
        filename: "evil.png",
      });
      expect(result).toHaveProperty("success", true);
    });
  });
});
