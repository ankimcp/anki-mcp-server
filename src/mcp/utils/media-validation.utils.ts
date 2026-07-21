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

// ── SSRF range allowlist ────────────────────────────────────────────────────

// SSRF guard: allowlist approach (fail-closed). Only ordinary public unicast
// addresses may be fetched. Every other ipaddr.js range — private, loopback,
// linkLocal, reserved, unspecified, uniqueLocal, carrierGradeNat, multicast,
// broadcast, and IPv6 transition ranges (rfc6052/NAT64, rfc6145/SIIT, 6to4,
// teredo, benchmarking, amt) — is rejected, including any range ipaddr.js may
// add in future versions. IPv6 addresses that embed an IPv4 target (IPv4-mapped
// ::ffff:0:0/96 and deprecated IPv4-compatible ::/96) are classified by the
// embedded IPv4 instead: it is extracted first, then re-checked against this
// allowlist, so wrapping an internal IPv4 in IPv6 does not bypass the guard.
const ALLOWED_RANGE = "unicast";

function isPublicUnicast(addr: ipaddr.IPv4 | ipaddr.IPv6): boolean {
  return addr.range() === ALLOWED_RANGE;
}

// Deprecated IPv4-compatible IPv6 (::/96, RFC 4291 §2.5.5.1): top 96 bits are
// zero, IPv4 embedded in the low 32 bits. ipaddr.js classifies the hex-group
// form (e.g. ::a9fe:a9fe ≡ 169.254.169.254) as plain "unicast", so without
// extraction it would pass the allowlist while targeting an internal IPv4.
// Strictly requires parts[0..5] === 0, so it never matches IPv4-mapped
// (parts[5] === 0xffff) or rfc6145/SIIT (::ffff:0:0/96). Also matches "::" and
// "::1", which extract to 0.0.0.0 / 0.0.0.1 → non-unicast → blocked (fail-closed).
function isIPv4CompatibleAddress(ipv6: ipaddr.IPv6): boolean {
  return ipv6.parts.slice(0, 6).every((part) => part === 0);
}

// Build the embedded IPv4 from the low 32 bits (two 16-bit groups). ipaddr.js's
// toIPv4Address() only accepts IPv4-mapped addresses, so construct it manually.
function extractEmbeddedIPv4(ipv6: ipaddr.IPv6): ipaddr.IPv4 {
  const high = ipv6.parts[6];
  const low = ipv6.parts[7];
  return new ipaddr.IPv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
}

// Parse an IP string and, for IPv6 that embeds an IPv4 target (IPv4-mapped
// ::ffff:0:0/96 or deprecated IPv4-compatible ::/96), return the embedded IPv4
// so downstream checks classify the real target. Returns null for
// non-IP / unparseable input. Uses `instanceof ipaddr.IPv6` for narrowing so no
// type cast is needed. Extraction is lossless — distinct addresses never
// collapse to the same value.
function parseTargetAddress(ip: string): ipaddr.IPv4 | ipaddr.IPv6 | null {
  if (!ipaddr.isValid(ip)) return null;
  let addr: ipaddr.IPv4 | ipaddr.IPv6 = ipaddr.parse(ip);
  if (addr instanceof ipaddr.IPv6) {
    if (addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
    else if (isIPv4CompatibleAddress(addr)) addr = extractEmbeddedIPv4(addr);
  }
  return addr;
}

// Validate a single resolved address against the SSRF allowlist: parse it,
// extract any embedded IPv4 target (mapped ::ffff:0:0/96 or deprecated
// IPv4-compatible ::/96) so the check classifies the real target, then
// require public unicast. Throws MediaUrlBlockedError on any failure
// (fail-closed, including unparseable addresses).
function assertAddressAllowed(ip: string): void {
  const addr = parseTargetAddress(ip);
  if (!addr || !isPublicUnicast(addr)) {
    throw new MediaUrlBlockedError();
  }
}

// Canonicalize an IP string for equality comparison. Routes through the same
// embedded-IPv4 extraction as the SSRF check, so equivalent forms of the same
// target compare equal (e.g. "::ffff:10.0.0.5" and "10.0.0.5" both normalize to
// "10.0.0.5"; "::a9fe:a9fe" normalizes to "169.254.169.254"). Also collapses
// compressed vs expanded IPv6 ("fd00::1" and "fd00:0:0:0:0:0:0:1" → "fd00::1").
// Returns null for non-IP strings (hostnames), which are matched separately by
// name and never participate in IP comparison. Extraction is lossless, so two
// genuinely-different targets never normalize to the same string.
function normalizeIp(value: string): string | null {
  return parseTargetAddress(value)?.toString() ?? null;
}

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
 * 3. ALL resolved IPs are public unicast addresses (unless host is in allowedHosts)
 *
 * NOTE: This validation is subject to DNS rebinding (TOCTOU). We resolve and validate the IPs here,
 * but AnkiConnect re-resolves the hostname when fetching. An attacker controlling DNS could return
 * a public IP for our check and a private IP for AnkiConnect's fetch. This is an inherent limitation
 * when we cannot control the downstream HTTP client.
 *
 * @throws MediaUrlInvalidError if the URL cannot be parsed or the hostname does not resolve
 * @throws MediaUrlSchemeError if the scheme is not http(s)
 * @throws MediaUrlBlockedError if any resolved IP is not a public unicast address
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

  // Resolve hostname to ALL its addresses. A host can have multiple A/AAAA
  // records; validating only the first would let a sibling private/internal
  // record slip through the guard.
  let resolved: dns.LookupAddress[];
  try {
    resolved = await dns.promises.lookup(hostnameForLookup, { all: true });
  } catch {
    throw new MediaUrlInvalidError();
  }
  if (resolved.length === 0) {
    throw new MediaUrlInvalidError();
  }

  // First resolved address, returned for informational purposes (backward compat)
  const resolvedIp = resolved[0].address;

  // Check if host is in the allowed list (skip range checks if so).
  // Semantics: the escape hatch is an explicit user opt-in for a host, so it
  // applies when the user listed this host by name — hostname matches either
  // as-is or with IPv6-literal brackets stripped (hostnameForLookup), so
  // "::1" and "[::1]" both work — OR by IP, where EVERY resolved address must
  // be individually allowlisted. Requiring all addresses prevents a
  // multi-record host from piggybacking a non-allowlisted internal address
  // on one allowlisted IP.
  if (config.allowedHosts && config.allowedHosts.length > 0) {
    const allowedHosts = config.allowedHosts;
    const hostnameAllowed =
      allowedHosts.includes(hostname) ||
      allowedHosts.includes(hostnameForLookup);
    // IP-based match compares by NORMALIZED value so an allowlist entry written
    // in a different-but-equivalent form (compressed vs expanded IPv6, or an
    // embedded-IPv4 IPv6 vs the bare IPv4) still matches the resolved address.
    // Non-IP entries normalize to null and are ignored here (already handled by
    // the hostname match above).
    const allowedIps = allowedHosts
      .map(normalizeIp)
      .filter((ip): ip is string => ip !== null);
    const allIpsAllowed = resolved.every(({ address }) => {
      const normalized = normalizeIp(address);
      return normalized !== null && allowedIps.includes(normalized);
    });
    if (hostnameAllowed || allIpsAllowed) {
      return { hostname, resolvedIp };
    }
  }

  // Every resolved address must pass the allowlist — reject if ANY is not a
  // public unicast target
  for (const { address } of resolved) {
    assertAddressAllowed(address);
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
