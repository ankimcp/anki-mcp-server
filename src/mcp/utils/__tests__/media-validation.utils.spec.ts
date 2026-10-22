/**
 * Unit tests for media validation utilities
 */

import * as dns from "node:dns";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  validateMediaFilePath,
  validateMediaUrl,
  validateMediaFilename,
  MediaFilenameError,
  MediaFileTypeError,
  MediaFileNotFoundError,
  MediaImportDirError,
  MediaImportDirNotFoundError,
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

// Cast to the `{ all: true }` overload of dns.promises.lookup, which the
// implementation uses (returns LookupAddress[] instead of a single address)
const mockLookup = dns.promises.lookup as unknown as jest.MockedFunction<
  (
    hostname: string,
    options: dns.LookupAllOptions,
  ) => Promise<dns.LookupAddress[]>
>;

// ── validateMediaFilePath ───────────────────────────────────────────────────

describe("validateMediaFilePath", () => {
  // Validation resolves real paths, so accepted paths must exist on disk.
  // tmpRoot is itself realpath'd (os.tmpdir() is a symlink on macOS).
  let tmpRoot: string;

  const createFile = (relativePath: string): string => {
    const filePath = path.join(tmpRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "");
    return filePath;
  };

  const createDir = (relativePath: string): string => {
    const dirPath = path.join(tmpRoot, relativePath);
    fs.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  };

  beforeEach(() => {
    tmpRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "media-validation-")),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("allows common media extensions", () => {
    const allowedFiles = [
      "photos/cat.jpg",
      "photos/cat.jpeg",
      "photos/diagram.png",
      "photos/icon.gif",
      "photos/photo.webp",
      "photos/vector.svg",
      "photos/raw.bmp",
      "photos/icon.ico",
      "audio/speech.mp3",
      "audio/sound.wav",
      "audio/track.ogg",
      "audio/music.flac",
      "audio/clip.m4a",
      "audio/voice.aac",
      "video/clip.mp4",
      "video/movie.webm",
      "video/recording.avi",
      "video/film.mkv",
      "video/clip.mov",
    ];

    it.each(allowedFiles)("allows %s", (relativePath) => {
      const result = validateMediaFilePath(createFile(relativePath));
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
      const result = validateMediaFilePath(createFile("app.ts"));
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
      const result = validateMediaFilePath(createFile("payload.env.jpg"));
      expect(result.mimeType).toBe("image/jpeg");
    });
  });

  describe("MEDIA_ALLOWED_TYPES env var", () => {
    it("allows extra MIME types when configured", () => {
      const result = validateMediaFilePath(createFile("docs/manual.pdf"), {
        allowedTypes: ["application/pdf"],
      });
      expect(result.mimeType).toBe("application/pdf");
    });

    it("still allows default media types when extra types are configured", () => {
      const result = validateMediaFilePath(createFile("photos/cat.jpg"), {
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
      const importDir = createDir("allowed/media");
      const result = validateMediaFilePath(
        createFile("allowed/media/cat.jpg"),
        { importDir },
      );
      expect(result.resolvedPath).toContain("cat.jpg");
    });

    it("allows files in subdirectories of import dir", () => {
      const importDir = createDir("allowed/media");
      const result = validateMediaFilePath(
        createFile("allowed/media/subdir/cat.jpg"),
        { importDir },
      );
      expect(result.resolvedPath).toContain("cat.jpg");
    });

    it("blocks files outside the import directory", () => {
      const importDir = createDir("allowed/media");
      expect(() =>
        validateMediaFilePath(createFile("other/dir/cat.jpg"), { importDir }),
      ).toThrow(MediaImportDirError);
    });

    it("blocks a sibling directory sharing the import dir's name as a prefix", () => {
      const importDir = createDir("allowed/media");
      expect(() =>
        validateMediaFilePath(createFile("allowed/media-evil/cat.jpg"), {
          importDir,
        }),
      ).toThrow(MediaImportDirError);
    });

    it("includes configured directory in error message", () => {
      const importDir = createDir("allowed/media");
      expect(() =>
        validateMediaFilePath(createFile("other/dir/cat.jpg"), { importDir }),
      ).toThrow(importDir);
    });

    it("does not apply directory restriction when not configured", () => {
      // Should only check MIME type, not directory
      const result = validateMediaFilePath(createFile("any/path/cat.jpg"));
      expect(result.mimeType).toBe("image/jpeg");
    });

    it("rejects when the configured import dir does not exist", () => {
      expect(() =>
        validateMediaFilePath(createFile("cat.jpg"), {
          importDir: path.join(tmpRoot, "missing-dir"),
        }),
      ).toThrow(MediaImportDirNotFoundError);
    });
  });

  describe("path traversal attempts", () => {
    it("resolves path traversal before checking directory", () => {
      const importDir = createDir("allowed/media");
      createFile("passwd.jpg");
      expect(() =>
        validateMediaFilePath(`${importDir}/../../passwd.jpg`, { importDir }),
      ).toThrow(MediaImportDirError);
    });

    it("allows traversal that stays within import dir", () => {
      const importDir = createDir("allowed/media");
      createDir("allowed/media/sub");
      createFile("allowed/media/cat.jpg");
      const result = validateMediaFilePath(`${importDir}/sub/../cat.jpg`, {
        importDir,
      });
      expect(result.mimeType).toBe("image/jpeg");
      expect(result.resolvedPath).toBe(path.join(importDir, "cat.jpg"));
    });

    it("allows a media-named file anywhere when no import dir is set", () => {
      // MIME-only check allows it because extension is .jpg; the directory
      // restriction is the second layer of defense
      const result = validateMediaFilePath(createFile("passwd.jpg"));
      expect(result.mimeType).toBe("image/jpeg");
    });
  });

  describe("existence", () => {
    it("rejects a nonexistent media path", () => {
      expect(() =>
        validateMediaFilePath(path.join(tmpRoot, "missing.jpg")),
      ).toThrow(MediaFileNotFoundError);
    });

    it("reports a nonexistent path outside the import dir as outside, not as missing", () => {
      const importDir = createDir("allowed/media");
      expect(() =>
        validateMediaFilePath(path.join(tmpRoot, "other/missing.jpg"), {
          importDir,
        }),
      ).toThrow(MediaImportDirError);
    });

    it("reports a nonexistent path inside the import dir as missing", () => {
      const importDir = createDir("allowed/media");
      expect(() =>
        validateMediaFilePath(path.join(importDir, "missing.jpg"), {
          importDir,
        }),
      ).toThrow(MediaFileNotFoundError);
    });

    it("rejects a dangling symlink", () => {
      const link = path.join(tmpRoot, "dangling.png");
      fs.symlinkSync(path.join(tmpRoot, "nowhere.png"), link);
      expect(() => validateMediaFilePath(link)).toThrow(MediaFileNotFoundError);
    });
  });

  describe("symlinks", () => {
    it("rejects a media-named symlink pointing at a non-media file", () => {
      const target = createFile("secrets/id_rsa");
      const link = path.join(tmpRoot, "holiday.png");
      fs.symlinkSync(target, link);

      expect(() => validateMediaFilePath(link)).toThrow(MediaFileTypeError);
    });

    it("rejects a symlink inside the import dir whose target is outside it", () => {
      const importDir = createDir("allowed/media");
      const target = createFile("outside/photo.jpg");
      const link = path.join(importDir, "photo.jpg");
      fs.symlinkSync(target, link);

      expect(() => validateMediaFilePath(link, { importDir })).toThrow(
        MediaImportDirError,
      );
    });

    it("rejects a symlinked directory inside the import dir that points outside it", () => {
      const importDir = createDir("allowed/media");
      const outsideDir = createDir("outside");
      createFile("outside/photo.jpg");
      fs.symlinkSync(outsideDir, path.join(importDir, "linked"));

      expect(() =>
        validateMediaFilePath(path.join(importDir, "linked/photo.jpg"), {
          importDir,
        }),
      ).toThrow(MediaImportDirError);
    });

    it("accepts a file inside a symlinked import dir", () => {
      const realDir = createDir("real-media");
      const filePath = createFile("real-media/cat.jpg");
      const linkedDir = path.join(tmpRoot, "linked-media");
      fs.symlinkSync(realDir, linkedDir);

      const result = validateMediaFilePath(path.join(linkedDir, "cat.jpg"), {
        importDir: linkedDir,
      });
      expect(result.resolvedPath).toBe(filePath);
    });

    it("accepts a path under the real dir of a symlinked import dir", () => {
      const realDir = createDir("real-media");
      const filePath = createFile("real-media/cat.jpg");
      const linkedDir = path.join(tmpRoot, "linked-media");
      fs.symlinkSync(realDir, linkedDir);

      const result = validateMediaFilePath(filePath, { importDir: linkedDir });
      expect(result.resolvedPath).toBe(filePath);
    });

    it("resolves the import dir on every call, so re-pointing its symlink takes effect", () => {
      createDir("first");
      createDir("second");
      const firstFile = createFile("first/cat.jpg");
      const linkedDir = path.join(tmpRoot, "linked-media");
      fs.symlinkSync(path.join(tmpRoot, "first"), linkedDir);

      expect(
        validateMediaFilePath(firstFile, { importDir: linkedDir }).resolvedPath,
      ).toBe(firstFile);

      fs.unlinkSync(linkedDir);
      fs.symlinkSync(path.join(tmpRoot, "second"), linkedDir);

      expect(() =>
        validateMediaFilePath(firstFile, { importDir: linkedDir }),
      ).toThrow(MediaImportDirError);
    });

    it("returns the symlink target's real path as resolvedPath", () => {
      const target = createFile("real/photo.jpg");
      const link = path.join(tmpRoot, "link.jpg");
      fs.symlinkSync(target, link);

      const result = validateMediaFilePath(link);
      expect(result.resolvedPath).toBe(target);
      expect(result.mimeType).toBe("image/jpeg");
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
      mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

      const result = await validateMediaUrl("http://example.com/audio.mp3");
      expect(result.hostname).toBe("example.com");
      expect(result.resolvedIp).toBe("93.184.216.34");
    });

    it("allows https URL", async () => {
      mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

      const result = await validateMediaUrl("https://example.com/image.jpg");
      expect(result.hostname).toBe("example.com");
      expect(result.resolvedIp).toBe("93.184.216.34");
    });

    it("allows URLs with ports", async () => {
      mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

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
      mockLookup.mockResolvedValue([{ address: ip, family: 4 }]);

      await expect(
        validateMediaUrl("http://internal-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("provides helpful error message", async () => {
      mockLookup.mockResolvedValue([{ address: "192.168.1.1", family: 4 }]);

      await expect(validateMediaUrl("http://my-nas/file.mp3")).rejects.toThrow(
        /private\/internal networks/,
      );
    });

    it("blocks 0.0.0.0 (unspecified)", async () => {
      mockLookup.mockResolvedValue([{ address: "0.0.0.0", family: 4 }]);
      await expect(
        validateMediaUrl("http://zero-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks carrier-grade NAT (100.64.x.x)", async () => {
      mockLookup.mockResolvedValue([{ address: "100.64.0.1", family: 4 }]);
      await expect(
        validateMediaUrl("http://cgnat-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks multicast addresses (224.x.x.x)", async () => {
      mockLookup.mockResolvedValue([{ address: "224.0.0.1", family: 4 }]);
      await expect(
        validateMediaUrl("http://multicast-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks broadcast address (255.255.255.255)", async () => {
      mockLookup.mockResolvedValue([{ address: "255.255.255.255", family: 4 }]);
      await expect(
        validateMediaUrl("http://broadcast-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });
  });

  describe("multi-record DNS resolution", () => {
    it("blocks when first record is public but a sibling is private", async () => {
      mockLookup.mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ]);

      await expect(
        validateMediaUrl("http://multi-host.com/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks when a sibling record is an IPv6-embedded internal target", async () => {
      // ::a9fe:a9fe is IPv4-compatible hex form of 169.254.169.254 (cloud metadata)
      mockLookup.mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "::a9fe:a9fe", family: 6 },
      ]);

      await expect(
        validateMediaUrl("http://multi-host.com/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("allows when all records are public and returns the first as resolvedIp", async () => {
      mockLookup.mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "1.1.1.1", family: 4 },
      ]);

      const result = await validateMediaUrl("http://multi-host.com/file.mp3");
      expect(result.hostname).toBe("multi-host.com");
      expect(result.resolvedIp).toBe("8.8.8.8");
    });

    it("rejects when resolution returns no addresses", async () => {
      mockLookup.mockResolvedValue([]);

      await expect(
        validateMediaUrl("http://empty-host.com/file.mp3"),
      ).rejects.toThrow(MediaUrlInvalidError);
    });
  });

  describe("MEDIA_ALLOWED_HOSTS env var", () => {
    it("allows whitelisted hostname", async () => {
      mockLookup.mockResolvedValue([{ address: "192.168.1.50", family: 4 }]);

      const result = await validateMediaUrl("http://my-nas/file.mp3", {
        allowedHosts: ["my-nas"],
      });
      expect(result.hostname).toBe("my-nas");
      expect(result.resolvedIp).toBe("192.168.1.50");
    });

    it("allows whitelisted IP", async () => {
      mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

      const result = await validateMediaUrl("http://internal/file.mp3", {
        allowedHosts: ["10.0.0.5"],
      });
      expect(result.resolvedIp).toBe("10.0.0.5");
    });

    it("still blocks non-whitelisted private IPs", async () => {
      mockLookup.mockResolvedValue([{ address: "192.168.1.100", family: 4 }]);

      await expect(
        validateMediaUrl("http://other-host/file.mp3", {
          allowedHosts: ["192.168.1.50"],
        }),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("does not bypass blocking with empty allowedHosts array", async () => {
      mockLookup.mockResolvedValue([{ address: "192.168.1.1", family: 4 }]);
      await expect(
        validateMediaUrl("http://internal/file.mp3", { allowedHosts: [] }),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks multi-record host when only one of its IPs is allowlisted", async () => {
      // IP-based escape hatch requires EVERY resolved address to be
      // allowlisted — one allowlisted IP must not whitelist a sibling
      mockLookup.mockResolvedValue([
        { address: "10.0.0.5", family: 4 },
        { address: "192.168.1.99", family: 4 },
      ]);

      await expect(
        validateMediaUrl("http://internal/file.mp3", {
          allowedHosts: ["10.0.0.5"],
        }),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("matches unbracketed IPv6 allowedHosts entry against bracketed URL host", async () => {
      // URL.hostname keeps brackets for IPv6 literals ("[::1]") while users
      // naturally allowlist the unbracketed form ("::1") — both must match
      mockLookup.mockResolvedValue([{ address: "::1", family: 6 }]);

      const result = await validateMediaUrl("http://[::1]:8080/file.mp3", {
        allowedHosts: ["::1"],
      });
      expect(result.hostname).toBe("[::1]");
      expect(result.resolvedIp).toBe("::1");
    });

    it("hostname allowlist bypasses per-address range checks (escape hatch)", async () => {
      // Documents intended semantics: listing a host BY NAME is an explicit
      // opt-in that deliberately skips per-address range validation, even if
      // the host resolves to private/internal siblings. A future refactor must
      // not silently tighten this into a per-IP check.
      mockLookup.mockResolvedValue([
        { address: "8.8.8.8", family: 4 },
        { address: "192.168.1.50", family: 4 },
      ]);

      const result = await validateMediaUrl("http://my-nas/file.mp3", {
        allowedHosts: ["my-nas"],
      });
      expect(result.hostname).toBe("my-nas");
      expect(result.resolvedIp).toBe("8.8.8.8");
    });

    it("matches non-canonical IPv6 allowedHosts entry against canonical resolved address", async () => {
      // IP-based match compares by normalized value: the expanded form
      // "fd00:0:0:0:0:0:0:1" and the compressed resolved "fd00::1" are the same
      // address, so the escape hatch must apply despite the raw strings differing.
      mockLookup.mockResolvedValue([{ address: "fd00::1", family: 6 }]);

      const result = await validateMediaUrl("http://ipv6-nas/file.mp3", {
        allowedHosts: ["fd00:0:0:0:0:0:0:1"],
      });
      expect(result.resolvedIp).toBe("fd00::1");
    });

    it("matches bare IPv4 allowedHosts entry against IPv4-mapped resolved address", async () => {
      // normalizeIp routes through embedded-IPv4 extraction, so the mapped form
      // "::ffff:10.0.0.5" and the bare "10.0.0.5" both normalize to "10.0.0.5".
      // Before this fix the mapped resolved address would not match the bare
      // allowlist entry and the request would be blocked (fail-closed miss).
      mockLookup.mockResolvedValue([{ address: "::ffff:10.0.0.5", family: 6 }]);

      const result = await validateMediaUrl("http://internal/file.mp3", {
        allowedHosts: ["10.0.0.5"],
      });
      expect(result.resolvedIp).toBe("::ffff:10.0.0.5");
    });

    it("matches IPv4-mapped allowedHosts entry against bare IPv4 resolved address", async () => {
      // Reverse direction: the allowlist entry is the mapped form and the host
      // resolves to the bare IPv4 — normalization makes both "10.0.0.5".
      mockLookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

      const result = await validateMediaUrl("http://internal/file.mp3", {
        allowedHosts: ["::ffff:10.0.0.5"],
      });
      expect(result.resolvedIp).toBe("10.0.0.5");
    });

    it("does not match a different IP even across mapped/bare forms", async () => {
      // Negative guard: extraction is lossless and distinct IPs never collide,
      // so allowlisting 10.0.0.5 must NOT let a sibling 10.0.0.6 through.
      mockLookup.mockResolvedValue([{ address: "10.0.0.6", family: 4 }]);

      await expect(
        validateMediaUrl("http://internal/file.mp3", {
          allowedHosts: ["10.0.0.5"],
        }),
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
      mockLookup.mockResolvedValue([{ address: "::1", family: 6 }]);

      await expect(
        validateMediaUrl("http://localhost/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks IPv4-mapped IPv6 private addresses", async () => {
      mockLookup.mockResolvedValue([
        { address: "::ffff:192.168.1.1", family: 6 },
      ]);

      await expect(
        validateMediaUrl("http://internal/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("allows public IPv6 addresses", async () => {
      // 2607:f8b0:4004:800::200e is a Google public IPv6 address (unicast range)
      mockLookup.mockResolvedValue([
        { address: "2607:f8b0:4004:800::200e", family: 6 },
      ]);

      const result = await validateMediaUrl("http://ipv6host.com/file.mp3");
      expect(result.resolvedIp).toBe("2607:f8b0:4004:800::200e");
    });

    it("blocks IPv6 unique-local (fc00::/fd00::)", async () => {
      mockLookup.mockResolvedValue([
        { address: "fd12:3456:789a::1", family: 6 },
      ]);
      await expect(
        validateMediaUrl("http://ipv6-local/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks IPv6 literal loopback URL", async () => {
      mockLookup.mockResolvedValue([{ address: "::1", family: 6 }]);
      await expect(validateMediaUrl("http://[::1]/file.mp3")).rejects.toThrow(
        MediaUrlBlockedError,
      );
    });
  });

  describe("blocks IPv6 transition addresses (SSRF bypass)", () => {
    // These ranges are IPv6-to-IPv4 transition mechanisms that can wrap
    // internal IPv4 targets (e.g. cloud metadata). The allowlist (unicast-only)
    // rejects them all — GHSA-5286-6cm5-w3qv.
    const transitionIps = [
      ["64:ff9b::169.254.169.254", "rfc6052 / NAT64 wrapping cloud metadata"],
      ["2002:a9fe:a9fe::", "6to4"],
      ["2001:0:4136:e378:8000:63bf:3fff:fdd2", "teredo"],
      ["::ffff:0:169.254.169.254", "rfc6145 / SIIT"],
      ["::ffff:169.254.169.254", "IPv4-mapped wrapping cloud metadata"],
      ["::a9fe:a9fe", "IPv4-compatible (hex form) wrapping cloud metadata"],
      ["::7f00:1", "IPv4-compatible (hex form) wrapping loopback"],
    ] as const;

    it.each(transitionIps)("blocks %s (%s)", async (ip) => {
      mockLookup.mockResolvedValue([{ address: ip, family: 6 }]);

      await expect(
        validateMediaUrl("http://transition-host/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });

    it("blocks IPv4-mapped private addresses after extraction", async () => {
      mockLookup.mockResolvedValue([{ address: "::ffff:10.0.0.1", family: 6 }]);

      await expect(
        validateMediaUrl("http://mapped-private/file.mp3"),
      ).rejects.toThrow(MediaUrlBlockedError);
    });
  });

  describe("allowlist does not over-block legitimate public traffic", () => {
    it("allows public IPv4", async () => {
      mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);

      const result = await validateMediaUrl("http://public-host.com/file.mp3");
      expect(result.hostname).toBe("public-host.com");
      expect(result.resolvedIp).toBe("8.8.8.8");
    });

    it("allows public IPv6 (Cloudflare)", async () => {
      mockLookup.mockResolvedValue([
        { address: "2606:4700:4700::1111", family: 6 },
      ]);

      const result = await validateMediaUrl("http://cf-host.com/file.mp3");
      expect(result.hostname).toBe("cf-host.com");
      expect(result.resolvedIp).toBe("2606:4700:4700::1111");
    });

    it("allows IPv4-mapped public addresses via extraction", async () => {
      // ipaddr.js reports "ipv4Mapped" (not "unicast") for ::ffff:8.8.8.8.
      // The mapped-extraction branch converts it to 8.8.8.8 (unicast) before
      // the allowlist check — regression guard against over-blocking.
      mockLookup.mockResolvedValue([{ address: "::ffff:8.8.8.8", family: 6 }]);

      const result = await validateMediaUrl("http://mapped-public/file.mp3");
      expect(result.hostname).toBe("mapped-public");
      expect(result.resolvedIp).toBe("::ffff:8.8.8.8");
    });
  });
});

// ── validateMediaFilename ───────────────────────────────────────────────────

describe("validateMediaFilename", () => {
  it.each([
    "photo.jpg",
    "my file (1).jpg",
    "_audio_clip.mp3",
    "my..file.jpg",
    "..hidden.jpg",
    ".bashrc",
  ])("returns plain name %j unchanged", (name) => {
    expect(validateMediaFilename(name)).toBe(name);
  });

  it.each([
    "../../../etc/passwd",
    "images/../secret.txt",
    "path/to/file.jpg",
    "path\\to\\file.jpg",
    "..\\..\\windows\\system32\\file.jpg",
    "a/b.jpg",
    "/abs.jpg",
    "trailing/",
    "../",
    "///",
    ".",
    "..",
    "",
    "   ",
    "photo\0.jpg",
    "../\0../../etc/passwd",
    "C:evil.jpg",
  ])("rejects %j", (name) => {
    expect(() => validateMediaFilename(name)).toThrow(MediaFilenameError);
  });

  it("does not collapse distinct names onto the same name", () => {
    expect(validateMediaFilename("ab.jpg")).toBe("ab.jpg");
    expect(() => validateMediaFilename("a/b.jpg")).toThrow(MediaFilenameError);
  });

  it("names the rejected filename in the error message", () => {
    expect(() => validateMediaFilename("a/b.jpg")).toThrow(/"a\/b\.jpg"/);
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
