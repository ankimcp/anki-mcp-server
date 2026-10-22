import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { APP_CONFIG, type AppConfig } from "@/config";

/**
 * Origin Validation Guard
 *
 * Validates the Origin header on incoming HTTP requests to prevent DNS rebinding attacks.
 * This is a REQUIRED security measure per the MCP Streamable HTTP specification.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#security-warning
 *
 * Configuration:
 * - Set ALLOWED_ORIGINS environment variable (comma-separated list of patterns)
 * - Default: 'http://localhost:*,http://127.0.0.1:*,https://localhost:*,https://127.0.0.1:*'
 * - Supports wildcard patterns: '*' matches one host label or a port, never
 *   '.', '/' or ':' — 'http://localhost:*' matches any port and
 *   'https://*.ngrok.io' matches 'https://abc.ngrok.io' but not
 *   'https://a.b.ngrok.io'
 *
 * The Origin header is compared as-is. A Referer (used when Origin is absent)
 * is reduced to its origin first, so its path and query cannot satisfy a
 * pattern; an unparseable Referer is rejected.
 *
 * The allowlist is sourced from validated config (`allowedOrigins`), which reads
 * ALLOWED_ORIGINS through the Zod config pipeline. Entries are checked here
 * rather than in the config schema because only HTTP mode uses them: an entry
 * that is not an origin throws at construction, which fails HTTP startup
 * without affecting STDIO or tunnel mode.
 */
@Injectable()
export class OriginValidationGuard implements CanActivate {
  private readonly logger = new Logger(OriginValidationGuard.name);
  private readonly allowedOriginPatterns: RegExp[];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    config.allowedOrigins.forEach(assertOriginPatternShape);
    this.allowedOriginPatterns =
      config.allowedOrigins.map(compileOriginPattern);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const { origin, referer } = request.headers;

    // No origin header - allow for direct API calls (curl, Postman, etc.)
    if (!origin && !referer) {
      return true;
    }

    const requestOrigin = origin || (referer ? refererOrigin(referer) : null);

    const isAllowed =
      requestOrigin !== null &&
      this.allowedOriginPatterns.some((pattern) => pattern.test(requestOrigin));

    if (!isAllowed) {
      this.logger.warn(
        `Rejected request from unauthorized origin: ${origin || referer}`,
      );
    }

    return isAllowed;
  }
}

/**
 * Shape of an ALLOWED_ORIGINS entry: `scheme://host[:port]`, where host and
 * port may contain `*`. No path, query, fragment or trailing slash — requests
 * are compared as origins, so such an entry could never match.
 */
const ORIGIN_PATTERN_SHAPE = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#\s]+$/;

function assertOriginPatternShape(pattern: string): void {
  if (!ORIGIN_PATTERN_SHAPE.test(pattern)) {
    throw new Error(
      `Invalid ALLOWED_ORIGINS entry ${JSON.stringify(pattern)}: entries must be origins ` +
        "like https://example.com or http://localhost:*, with a scheme and no path or trailing slash.",
    );
  }
}

/**
 * Compiles an allowlist pattern into an anchored regex. Every regex
 * metacharacter is escaped, so any configured string compiles; `*` then
 * becomes one segment that cannot cross '.', '/' or ':'.
 */
function compileOriginPattern(pattern: string): RegExp {
  const source = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\*/g, "[^./:]+");
  return new RegExp(`^${source}$`);
}

/** Returns the origin of a Referer URL, or null when it does not parse. */
function refererOrigin(referer: string): string | null {
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
