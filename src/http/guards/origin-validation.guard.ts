import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from "@nestjs/common";
import { Request } from "express";

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
 * - Supports wildcard patterns: 'http://localhost:*' matches any port
 */
@Injectable()
export class OriginValidationGuard implements CanActivate {
  private readonly logger = new Logger(OriginValidationGuard.name);
  private readonly allowedOrigins: string[];

  constructor() {
    const defaultOrigins =
      "http://localhost:*,http://127.0.0.1:*,https://localhost:*,https://127.0.0.1:*";
    const originsEnv = process.env.ALLOWED_ORIGINS || defaultOrigins;
    this.allowedOrigins = originsEnv.split(",").map((o) => o.trim());
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const origin = request.headers.origin || request.headers.referer;

    // No origin header - allow for direct API calls (curl, Postman, etc.)
    if (!origin) {
      return true;
    }

    // Check if origin matches any allowed pattern
    const isAllowed = this.allowedOrigins.some((allowedOrigin) =>
      this.matchesPattern(origin, allowedOrigin),
    );

    if (!isAllowed) {
      this.logger.warn(`Rejected request from unauthorized origin: ${origin}`);
    }

    return isAllowed;
  }

  /**
   * Matches an origin against a pattern with wildcard support
   *
   * @param origin - The origin to check (e.g., 'http://localhost:3000')
   * @param pattern - The pattern to match against (e.g., 'http://localhost:*')
   * @returns True if the origin matches the pattern
   */
  private matchesPattern(origin: string, pattern: string): boolean {
    // Exact match
    if (origin === pattern) {
      return true;
    }

    // Wildcard match
    if (pattern.includes("*")) {
      const regexPattern = pattern
        .replace(/\./g, "\\.") // Escape dots
        .replace(/\*/g, ".*"); // Convert * to .*
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(origin);
    }

    return false;
  }
}
