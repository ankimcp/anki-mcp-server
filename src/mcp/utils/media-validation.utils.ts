/**
 * Media validation utilities for path traversal prevention and SSRF protection.
 *
 * Provides three layers of defense:
 * 1. MIME type allowlist for file paths (blocks non-media files)
 * 2. URL/SSRF validation (blocks private/internal network requests)
 * 3. Filename sanitization (strips path traversal sequences)
 */

import * as path from "node:path";
import * as dns from "node:dns";
import mime from "mime";
import * as ipaddr from "ipaddr.js";

// ── Error classes ───────────────────────────────────────────────────────────

export class MediaFileTypeError extends Error {
  constructor() {
    super(
      "File type not allowed. Only media files (images, audio, video) are accepted. " +
        "To allow additional file types, set the MEDIA_ALLOWED_TYPES environment variable.",
    );
    this.name = "MediaFileTypeError";
  }
}

export class MediaImportDirError extends Error {
  constructor(configuredDir: string) {
    super(
      `File path is outside the allowed import directory (${configuredDir}). ` +
        "Update MEDIA_IMPORT_DIR to change the allowed directory.",
    );
    this.name = "MediaImportDirError";
  }
}

export class MediaUrlBlockedError extends Error {
  constructor() {
    super(
      "URL blocked: requests to private/internal networks are not allowed. " +
        "To allow specific hosts, set the MEDIA_ALLOWED_HOSTS environment variable.",
    );
    this.name = "MediaUrlBlockedError";
  }
}

export class MediaUrlSchemeError extends Error {
  constructor(scheme: string) {
    super(
      `URL scheme "${scheme}" is not allowed. Only http: and https: URLs are accepted.`,
    );
    this.name = "MediaUrlSchemeError";
  }
}

export class MediaUrlInvalidError extends Error {
  constructor() {
    super("Invalid URL provided.");
    this.name = "MediaUrlInvalidError";
  }
}

// ── Config interfaces ───────────────────────────────────────────────────────

export interface MediaFilePathConfig {
  /** Extra MIME types to allow beyond the default media types (e.g., ["application/pdf"]) */
  allowedTypes?: string[];
  /** If set, resolved file path must be inside this directory */
  importDir?: string;
}

export interface MediaUrlConfig {
  /** Hostnames or IPs that are allowed even if they resolve to private ranges */
  allowedHosts?: string[];
}

// ── Default allowed MIME type prefixes ──────────────────────────────────────

const DEFAULT_ALLOWED_PREFIXES = ["image/", "audio/", "video/"];

// ── IP ranges that should be blocked for SSRF prevention ────────────────────

const BLOCKED_RANGES = new Set([
  "private",
  "loopback",
  "linkLocal",
  "reserved",
  "unspecified",
  // IPv6-specific blocked ranges
  "uniqueLocal",
  // Additional ranges
  "carrierGradeNat",
  "multicast",
  "broadcast",
]);

// ── Path validation ─────────────────────────────────────────────────────────

/**
 * Validate a local file path for media import.
 *
 * Checks:
 * 1. File extension resolves to an allowed MIME type (image/*, audio/*, video/* by default)
 * 2. If importDir is configured, the resolved path must be inside that directory
 *
 * @throws MediaFileTypeError if the MIME type is not allowed
 * @throws MediaImportDirError if the path is outside the allowed directory
 */
export function validateMediaFilePath(
  filePath: string,
  config: MediaFilePathConfig = {},
): { resolvedPath: string; mimeType: string } {
  // Reject null bytes to prevent injection bypasses
  if (filePath.includes("\0")) {
    throw new MediaFileTypeError();
  }

  const resolvedPath = path.resolve(filePath);
  const detectedMime = mime.getType(resolvedPath);

  // Check MIME type against allowlist
  const isDefaultAllowed =
    detectedMime !== null &&
    DEFAULT_ALLOWED_PREFIXES.some((prefix) => detectedMime.startsWith(prefix));

  const isExtraAllowed =
    detectedMime !== null &&
    config.allowedTypes !== undefined &&
    config.allowedTypes.includes(detectedMime);

  if (!isDefaultAllowed && !isExtraAllowed) {
    throw new MediaFileTypeError();
  }

  // Check directory restriction if configured
  if (config.importDir) {
    const resolvedImportDir = path.resolve(config.importDir);
    // Ensure the import dir path ends with separator for prefix matching
    const normalizedImportDir = resolvedImportDir.endsWith(path.sep)
      ? resolvedImportDir
      : resolvedImportDir + path.sep;

    if (!resolvedPath.startsWith(normalizedImportDir)) {
      throw new MediaImportDirError(config.importDir);
    }
  }

  return { resolvedPath, mimeType: detectedMime };
}

// ── URL/SSRF validation ─────────────────────────────────────────────────────

/**
 * Validate a URL for SSRF safety before allowing it to be fetched by AnkiConnect.
 *
 * Checks:
 * 1. URL is valid and parseable
 * 2. Scheme is http: or https:
 * 3. Resolved IP is not in a private/reserved range (unless host is in allowedHosts)
 *
 * NOTE: This validation is subject to DNS rebinding (TOCTOU). We resolve and validate the IP here,
 * but AnkiConnect re-resolves the hostname when fetching. An attacker controlling DNS could return
 * a public IP for our check and a private IP for AnkiConnect's fetch. This is an inherent limitation
 * when we cannot control the downstream HTTP client.
 *
 * @throws MediaUrlInvalidError if the URL cannot be parsed
 * @throws MediaUrlSchemeError if the scheme is not http(s)
 * @throws MediaUrlBlockedError if the resolved IP is in a blocked range
 */
export async function validateMediaUrl(
  input: string,
  config: MediaUrlConfig = {},
): Promise<{ hostname: string; resolvedIp: string }> {
  // Parse URL
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new MediaUrlInvalidError();
  }

  // Check scheme
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new MediaUrlSchemeError(parsed.protocol.replace(":", ""));
  }

  const hostname = parsed.hostname;

  // Strip brackets from IPv6 literals for DNS lookup (e.g., "[::1]" → "::1")
  const hostnameForLookup =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;

  // Resolve hostname to IP
  let resolvedIp: string;
  try {
    const result = await dns.promises.lookup(hostnameForLookup);
    resolvedIp = result.address;
  } catch {
    throw new MediaUrlInvalidError();
  }

  // Check if host is in the allowed list (skip range check if so)
  if (config.allowedHosts && config.allowedHosts.length > 0) {
    const isAllowed = config.allowedHosts.some(
      (allowed) => allowed === hostname || allowed === resolvedIp,
    );
    if (isAllowed) {
      return { hostname, resolvedIp };
    }
  }

  // Parse and check IP range
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(resolvedIp);
  } catch {
    throw new MediaUrlBlockedError();
  }

  // For IPv4-mapped IPv6 addresses, extract the IPv4 part
  if (addr.kind() === "ipv6") {
    const ipv6 = addr as ipaddr.IPv6;
    if (ipv6.isIPv4MappedAddress()) {
      addr = ipv6.toIPv4Address();
    }
  }

  const range = addr.range();
  if (BLOCKED_RANGES.has(range)) {
    throw new MediaUrlBlockedError();
  }

  return { hostname, resolvedIp };
}

// ── Filename sanitization ───────────────────────────────────────────────────

/**
 * Sanitize a media filename by stripping path traversal sequences and extracting basename.
 *
 * - Strips null bytes
 * - Removes `..` sequences
 * - Strips path separators (`/`, `\`)
 * - Returns `path.basename()` of the cleaned result
 * - Returns "unnamed" for empty/invalid results
 */
export function sanitizeMediaFilename(filename: string): string {
  // Strip null bytes
  let sanitized = filename.replace(/\0/g, "");

  // Remove .. sequences
  sanitized = sanitized.replace(/\.\./g, "");

  // Remove path separators
  sanitized = sanitized.replace(/[/\\]/g, "");

  // Extract basename (handles any remaining edge cases)
  sanitized = path.basename(sanitized);

  // Fallback for empty results
  if (!sanitized || sanitized.trim() === "" || sanitized === ".") {
    return "unnamed";
  }

  return sanitized;
}

// ── Convenience functions that read from process.env ────────────────────────

/**
 * Build MediaFilePathConfig from environment variables.
 *
 * Reads:
 * - MEDIA_ALLOWED_TYPES: comma-separated list of additional MIME types
 * - MEDIA_IMPORT_DIR: directory restriction for file paths
 */
export function getMediaFilePathConfigFromEnv(): MediaFilePathConfig {
  const config: MediaFilePathConfig = {};

  const allowedTypes = process.env.MEDIA_ALLOWED_TYPES;
  if (allowedTypes) {
    config.allowedTypes = allowedTypes
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const importDir = process.env.MEDIA_IMPORT_DIR;
  if (importDir) {
    config.importDir = importDir;
  }

  return config;
}

/**
 * Build MediaUrlConfig from environment variables.
 *
 * Reads:
 * - MEDIA_ALLOWED_HOSTS: comma-separated list of allowed hostnames or IPs
 */
export function getMediaUrlConfigFromEnv(): MediaUrlConfig {
  const config: MediaUrlConfig = {};

  const allowedHosts = process.env.MEDIA_ALLOWED_HOSTS;
  if (allowedHosts) {
    config.allowedHosts = allowedHosts
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }

  return config;
}
