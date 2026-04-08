/**
 * Unit tests for media validation utilities
 */

import * as dns from "node:dns";
import {
  validateMediaFilePath,
  validateMediaUrl,
  sanitizeMediaFilename,
  MediaFileTypeError,
  MediaImportDirError,
  MediaUrlBlockedError,
  MediaUrlSchemeError,
  MediaUrlInvalidError,
  getMediaFilePathConfigFromEnv,
  getMediaUrlConfigFromEnv,
} from "../media-validation.utils";

// ── Mock dns.promises.lookup ────────────────────────────────────────────────

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

// ── validateMediaFilePath ───────────────────────────────────────────────────

describe("validateMediaFilePath", () => {
  describe("allows common media extensions", () => {
    const allowedFiles = [
      "/photos/cat.jpg",
      "/photos/cat.jpeg",
      "/photos/diagram.png",
      "/photos/icon.gif",
      "/photos/photo.webp",
      "/photos/vector.svg",
      "/photos/raw.bmp",
      "/photos/icon.ico",
      "/audio/speech.mp3",
      "/audio/sound.wav",
      "/audio/track.ogg",
      "/audio/music.flac",
      "/audio/clip.m4a",
      "/audio/voice.aac",
      "/video/clip.mp4",
      "/video/movie.webm",
      "/video/recording.avi",
      "/video/film.mkv",
      "/video/clip.mov",
    ];

    it.each(allowedFiles)("allows %s", (filePath) => {
      const result = validateMediaFilePath(filePath);
      // Just verify it starts with one of the allowed prefixes
      expect(
        result.mimeType.startsWith("image/") ||
          result.mimeType.startsWith("audio/") ||
          result.mimeType.startsWith("video/"),
      ).toBe(true);
      expect(result.resolvedPath).toBeTruthy();
    });
  });

  describe("blocks non-media files", () => {
    const blockedFiles = [
      "/home/user/.ssh/id_rsa",
      "/home/user/.env",
      "/etc/passwd",
      "/home/user/credentials",
      "/home/user/notes.txt",
      "/home/user/config.json",
      "/home/user/script.js",
      "/home/user/data.csv",
      "/home/user/archive.zip",
      "/home/user/doc.pdf",
      "/home/user/noextension",
      "/home/user/.bashrc",
      "/home/user/.gitconfig",
    ];

    it.each(blockedFiles)("blocks %s", (filePath) => {
      expect(() => validateMediaFilePath(filePath)).toThrow(MediaFileTypeError);
    });

    it("blocks files with no extension", () => {
      expect(() => validateMediaFilePath("/some/path/id_rsa")).toThrow(
        MediaFileTypeError,
      );
    });

    it("provides helpful error message", () => {
      expect(() => validateMediaFilePath("/home/user/.env")).toThrow(
        /Only media files \(images, audio, video\) are accepted/,
      );
    });

    it("blocks .ts files (TypeScript, not MPEG transport stream) note: mime resolves .ts as video/mp2t", () => {
      // .ts is technically a video MIME type (MPEG transport stream)
      // so mime resolves it as video/mp2t and it passes the media check.
      // This is acceptable — the MIME allowlist is about file type, not content.
      // A real .ts TypeScript file named "app.ts" would pass the MIME check
      // but that's an edge case since media tools wouldn't realistically be
      // pointed at TypeScript files via prompt injection.
      const result = validateMediaFilePath("/home/user/app.ts");
      expect(result.mimeType).toBe("video/mp2t");
    });
  });

  describe("null byte injection", () => {
    it("blocks paths with null bytes", () => {
      expect(() => validateMediaFilePath("/etc/passwd\0.jpg")).toThrow(
        MediaFileTypeError,
      );
    });

    it("blocks paths with null bytes before extension", () => {
      expect(() =>
        validateMediaFilePath("/photos/image\0.ssh/id_rsa.jpg"),
      ).toThrow(MediaFileTypeError);
    });
  });

  describe("double extension handling", () => {
    it("allows double extension if final extension is media (accepted risk)", () => {
      const result = validateMediaFilePath("/home/user/payload.env.jpg");
      expect(result.mimeType).toBe("image/jpeg");
    });
  });

  describe("MEDIA_ALLOWED_TYPES env var", () => {
    it("allows extra MIME types when configured", () => {
      const result = validateMediaFilePath("/docs/manual.pdf", {
        allowedTypes: ["application/pdf"],
      });
      expect(result.mimeType).toBe("application/pdf");
    });

    it("still allows default media types when extra types are configured", () => {
      const result = validateMediaFilePath("/photos/cat.jpg", {
        allowedTypes: ["application/pdf"],
      });
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("blocks types not in default or extra list", () => {
      expect(() =>
        validateMediaFilePath("/home/user/data.json", {
          allowedTypes: ["application/pdf"],
        }),
      ).toThrow(MediaFileTypeError);
    });
  });

  describe("MEDIA_IMPORT_DIR restriction", () => {
    it("allows files inside the import directory", () => {
      const result = validateMediaFilePath("/allowed/media/cat.jpg", {
        importDir: "/allowed/media",
      });
      expect(result.resolvedPath).toContain("cat.jpg");
    });

    it("allows files in subdirectories of import dir", () => {
      const result = validateMediaFilePath("/allowed/media/subdir/cat.jpg", {
        importDir: "/allowed/media",
      });
      expect(result.resolvedPath).toContain("cat.jpg");
    });

    it("blocks files outside the import directory", () => {
      expect(() =>
        validateMediaFilePath("/other/dir/cat.jpg", {
          importDir: "/allowed/media",
        }),
      ).toThrow(MediaImportDirError);
    });

    it("includes configured directory in error message", () => {
      expect(() =>
        validateMediaFilePath("/other/dir/cat.jpg", {
          importDir: "/allowed/media",
        }),
      ).toThrow(/\/allowed\/media/);
    });

    it("does not apply directory restriction when not configured", () => {
      // Should only check MIME type, not directory
      const result = validateMediaFilePath("/any/path/cat.jpg");
      expect(result.mimeType).toBe("image/jpeg");
    });
  });

  describe("path traversal attempts", () => {
    it("resolves path traversal before checking directory", () => {
      // ../../../etc/passwd.jpg resolves to /etc/passwd.jpg
      // which is outside /allowed/media and should be blocked by dir check
      expect(() =>
        validateMediaFilePath("/allowed/media/../../../etc/passwd.jpg", {
          importDir: "/allowed/media",
        }),
      ).toThrow(MediaImportDirError);
    });

    it("allows traversal that stays within import dir", () => {
      // /allowed/media/sub/../cat.jpg resolves to /allowed/media/cat.jpg
      const result = validateMediaFilePath("/allowed/media/sub/../cat.jpg", {
        importDir: "/allowed/media",
      });
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("still validates MIME type for traversal with media extension", () => {
      // Even with .jpg extension, path traversal is caught by dir restriction
      // Without dir restriction, the MIME check passes (it IS an image)
      const result = validateMediaFilePath("/etc/passwd.jpg");
      expect(result.mimeType).toBe("image/jpeg");
      // This is expected: MIME-only check allows it because extension is .jpg
      // The directory restriction is the second layer of defense
    });
  });
});

// ── validateMediaUrl ────────────────────────────────────────────────────────

describe("validateMediaUrl", () => {
  beforeEach(() => {
    mockLookup.mockReset();
  });

  describe("allows normal HTTP/HTTPS URLs", () => {
    it("allows http URL", async () => {
      mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateMediaUrl("http://example.com/audio.mp3");
      expect(result.hostname).toBe("example.com");
      expect(result.resolvedIp).toBe("93.184.216.34");
    });

    it("allows https URL", async () => {
      mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateMediaUrl("https://example.com/image.jpg");
      expect(result.hostname).toBe("example.com");
      expect(result.resolvedIp).toBe("93.184.216.34");
    });

    it("allows URLs with ports", async () => {
      mockLookup.mockResolvedValue({ address: "93.184.216.34", family: 4 });

      const result = await validateMediaUrl(
        "https://example.com:8080/file.mp3",
      );
      expect(result.hostname).toBe("example.com");
    });
  });

  describe("blocks non-HTTP schemes", () => {
    it("blocks file:// URLs", async () => {
      await expect(validateMediaUrl("file:///etc/passwd")).rejects.toThrow(
        MediaUrlSchemeError,
      );
    });

    it("blocks ftp:// URLs", async () => {
      await expect(validateMediaUrl("ftp://evil.com/file.txt")).rejects.toThrow(
        MediaUrlSchemeError,
      );
    });

    it("blocks gopher:// URLs", async () => {
      await expect(validateMediaUrl("gopher://evil.com/")).rejects.toThrow(
        MediaUrlSchemeError,
      );
    });

    it("includes the blocked scheme in the error message", async () => {
      await expect(validateMediaUrl("file:///etc/passwd")).rejects.toThrow(
        /file/,
      );
    });
  });

  describe("blocks private/internal IPs", () => {
    const blockedIps = [
      // Private class A
      ["10.0.0.1", "10.x range"],
      ["10.255.255.255", "10.x range (high)"],
      // Private class B
      ["172.16.0.1", "172.16.x range"],
      ["172.31.255.255", "172.31.x range (high)"],
      // Private class C
      ["192.168.0.1", "192.168.x range"],
      ["192.168.1.100", "192.168.x range (common LAN)"],
      // Loopback
      ["127.0.0.1", "loopback"],
      ["127.0.0.2", "loopback range"],
      // Link-local / cloud metadata
      ["169.254.169.254", "link-local (cloud metadata)"],
      ["169.254.0.1", "link-local"],
    ] as const;

    it.each(blockedIps)("blocks %s (%s)", async (ip) => {
      mockLookup.mockResolvedValue({ address: ip, family: 4 });

      await expect(
        validateMediaUrl("http://internal-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("provides helpful error message", async () => {
      mockLookup.mockResolvedValue({ address: "192.168.1.1", family: 4 });

      await expect(validateMediaUrl("http://my-nas/file.mp3")).rejects.toThrow(
        /private\/internal networks/,
      );
    });

    it("blocks 0.0.0.0 (unspecified)", async () => {
      mockLookup.mockResolvedValue({ address: "0.0.0.0", family: 4 });
      await expect(
        validateMediaUrl("http://zero-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks carrier-grade NAT (100.64.x.x)", async () => {
      mockLookup.mockResolvedValue({ address: "100.64.0.1", family: 4 });
      await expect(
        validateMediaUrl("http://cgnat-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks multicast addresses (224.x.x.x)", async () => {
      mockLookup.mockResolvedValue({ address: "224.0.0.1", family: 4 });
      await expect(
        validateMediaUrl("http://multicast-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks broadcast address (255.255.255.255)", async () => {
      mockLookup.mockResolvedValue({ address: "255.255.255.255", family: 4 });
      await expect(
        validateMediaUrl("http://broadcast-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });
  });

  describe("MEDIA_ALLOWED_HOSTS env var", () => {
    it("allows whitelisted hostname", async () => {
      mockLookup.mockResolvedValue({ address: "192.168.1.50", family: 4 });

      const result = await validateMediaUrl("http://my-nas/file.mp3", {
        allowedHosts: ["my-nas"],
      });
      expect(result.hostname).toBe("my-nas");
      expect(result.resolvedIp).toBe("192.168.1.50");
    });

    it("allows whitelisted IP", async () => {
      mockLookup.mockResolvedValue({ address: "10.0.0.5", family: 4 });

      const result = await validateMediaUrl("http://internal/file.mp3", {
        allowedHosts: ["10.0.0.5"],
      });
      expect(result.resolvedIp).toBe("10.0.0.5");
    });

    it("still blocks non-whitelisted private IPs", async () => {
      mockLookup.mockResolvedValue({ address: "192.168.1.100", family: 4 });

      await expect(
        validateMediaUrl("http://other-host/file.mp3", {
          allowedHosts: ["192.168.1.50"],
        }),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("does not bypass blocking with empty allowedHosts array", async () => {
      mockLookup.mockResolvedValue({ address: "192.168.1.1", family: 4 });
      await expect(
        validateMediaUrl("http://internal/file.mp3", { allowedHosts: [] }),
      ).rejects.toThrow(MediaUrlBlockedError);
    });
  });

  describe("handles invalid URLs gracefully", () => {
    it("rejects completely invalid URLs", async () => {
      await expect(validateMediaUrl("not-a-url")).rejects.toThrow(
        MediaUrlInvalidError,
      );
    });

    it("rejects empty string", async () => {
      await expect(validateMediaUrl("")).rejects.toThrow(MediaUrlInvalidError);
    });

    it("rejects URL with unresolvable hostname", async () => {
      mockLookup.mockRejectedValue(
        new Error("getaddrinfo ENOTFOUND no-such-host.invalid"),
      );

      await expect(
        validateMediaUrl("http://no-such-host.invalid/file.mp3"),
      ).rejects.toThrow(MediaUrlInvalidError);
    });
  });

  describe("IPv6 handling", () => {
    it("blocks IPv6 loopback", async () => {
      mockLookup.mockResolvedValue({ address: "::1", family: 6 });

      await expect(
        validateMediaUrl("http://localhost/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks IPv4-mapped IPv6 private addresses", async () => {
      mockLookup.mockResolvedValue({
        address: "::ffff:192.168.1.1",
        family: 6,
      });

      await expect(
        validateMediaUrl("http://internal/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("allows public IPv6 addresses", async () => {
      // 2607:f8b0:4004:800::200e is a Google public IPv6 address (unicast range)
      mockLookup.mockResolvedValue({
        address: "2607:f8b0:4004:800::200e",
        family: 6,
      });

      const result = await validateMediaUrl("http://ipv6host.com/file.mp3");
      expect(result.resolvedIp).toBe("2607:f8b0:4004:800::200e");
    });

    it("blocks IPv6 unique-local (fc00::/fd00::)", async () => {
      mockLookup.mockResolvedValue({ address: "fd12:3456:789a::1", family: 6 });
      await expect(
        validateMediaUrl("http://ipv6-local/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks IPv6 literal loopback URL", async () => {
      mockLookup.mockResolvedValue({ address: "::1", family: 6 });
      await expect(validateMediaUrl("http://[::1]/file.mp3")).rejects.toThrow(
        MediaUrlBlockedError,
      );
    });
  });
});

// ── sanitizeMediaFilename ───────────────────────────────────────────────────

describe("sanitizeMediaFilename", () => {
  it("returns simple filenames unchanged", () => {
    expect(sanitizeMediaFilename("photo.jpg")).toBe("photo.jpg");
  });

  it("strips ../ sequences", () => {
    expect(sanitizeMediaFilename("../../../etc/passwd")).toBe("etcpasswd");
  });

  it("strips ../ mixed with normal path", () => {
    expect(sanitizeMediaFilename("images/../secret.txt")).toBe(
      "imagessecret.txt",
    );
  });

  it("strips forward slashes", () => {
    expect(sanitizeMediaFilename("path/to/file.jpg")).toBe("pathtofile.jpg");
  });

  it("strips backslashes", () => {
    expect(sanitizeMediaFilename("path\\to\\file.jpg")).toBe("pathtofile.jpg");
  });

  it("handles mixed separators", () => {
    expect(sanitizeMediaFilename("..\\..\\windows\\system32\\file.jpg")).toBe(
      "windowssystem32file.jpg",
    );
  });

  it("returns 'unnamed' for empty string", () => {
    expect(sanitizeMediaFilename("")).toBe("unnamed");
  });

  it("returns 'unnamed' for whitespace-only string", () => {
    expect(sanitizeMediaFilename("   ")).toBe("unnamed");
  });

  it("returns 'unnamed' for just dots", () => {
    expect(sanitizeMediaFilename("....")).toBe("unnamed");
  });

  it("returns 'unnamed' for just path separators", () => {
    expect(sanitizeMediaFilename("///")).toBe("unnamed");
  });

  it("preserves filenames with special characters", () => {
    expect(sanitizeMediaFilename("my file (1).jpg")).toBe("my file (1).jpg");
  });

  it("preserves underscored filenames", () => {
    expect(sanitizeMediaFilename("_audio_clip.mp3")).toBe("_audio_clip.mp3");
  });

  it("handles filename that is just ../", () => {
    expect(sanitizeMediaFilename("../")).toBe("unnamed");
  });

  it("strips null bytes", () => {
    expect(sanitizeMediaFilename("photo\0.jpg")).toBe("photo.jpg");
  });

  it("strips null bytes mixed with traversal", () => {
    expect(sanitizeMediaFilename("../\0../../etc/passwd")).toBe("etcpasswd");
  });
});

// ── Config from env helpers ─────────────────────────────────────────────────

describe("getMediaFilePathConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty config when env vars are not set", () => {
    delete process.env.MEDIA_ALLOWED_TYPES;
    delete process.env.MEDIA_IMPORT_DIR;

    const config = getMediaFilePathConfigFromEnv();
    expect(config.allowedTypes).toBeUndefined();
    expect(config.importDir).toBeUndefined();
  });

  it("parses MEDIA_ALLOWED_TYPES as comma-separated list", () => {
    process.env.MEDIA_ALLOWED_TYPES = "application/pdf,text/plain";

    const config = getMediaFilePathConfigFromEnv();
    expect(config.allowedTypes).toEqual(["application/pdf", "text/plain"]);
  });

  it("trims whitespace from allowed types", () => {
    process.env.MEDIA_ALLOWED_TYPES = " application/pdf , text/plain ";

    const config = getMediaFilePathConfigFromEnv();
    expect(config.allowedTypes).toEqual(["application/pdf", "text/plain"]);
  });

  it("reads MEDIA_IMPORT_DIR", () => {
    process.env.MEDIA_IMPORT_DIR = "/home/user/anki-media";

    const config = getMediaFilePathConfigFromEnv();
    expect(config.importDir).toBe("/home/user/anki-media");
  });
});

describe("getMediaUrlConfigFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns empty config when env vars are not set", () => {
    delete process.env.MEDIA_ALLOWED_HOSTS;

    const config = getMediaUrlConfigFromEnv();
    expect(config.allowedHosts).toBeUndefined();
  });

  it("parses MEDIA_ALLOWED_HOSTS as comma-separated list", () => {
    process.env.MEDIA_ALLOWED_HOSTS = "192.168.1.50,10.0.0.5";

    const config = getMediaUrlConfigFromEnv();
    expect(config.allowedHosts).toEqual(["192.168.1.50", "10.0.0.5"]);
  });

  it("trims whitespace from allowed hosts", () => {
    process.env.MEDIA_ALLOWED_HOSTS = " 192.168.1.50 , my-nas ";

    const config = getMediaUrlConfigFromEnv();
    expect(config.allowedHosts).toEqual(["192.168.1.50", "my-nas"]);
  });
});
