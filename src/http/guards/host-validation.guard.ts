import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
  Logger,
} from "@nestjs/common";
import { Request } from "express";
import { APP_CONFIG, type AppConfig } from "@/config";

/** Bind hosts that are loopback literals — Host validation is a no-op risk here. */
const LOOPBACK_BIND_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * Decides whether to emit the fail-closed startup warning.
 *
 * The Host-validation guard only accepts loopback Host headers unless
 * `ALLOWED_HOSTS` is set. So binding to any non-loopback address (`0.0.0.0`,
 * `::`, or a concrete LAN/public IP like `192.168.1.50`) without configuring
 * `ALLOWED_HOSTS` is a footgun: requests arriving via the machine's real
 * hostname get 403'd. Warn in exactly that case.
 *
 * @param host         the bind host (`options.host`)
 * @param allowedHosts the validated `config.allowedHosts` list
 * @returns true when the bind host is non-loopback AND no extra hosts are allowed
 */
export function shouldWarnLoopbackOnly(
  host: string,
  allowedHosts: string[],
): boolean {
  const normalized = host.trim().toLowerCase();
  const isLoopbackBind = LOOPBACK_BIND_HOSTS.has(normalized);
  return !isLoopbackBind && allowedHosts.length === 0;
}

/**
 * Host Validation Guard
 *
 * Validates the HTTP `Host` header to defend against DNS-rebinding attacks
 * (advisory GHSA-j9xx-59ph-wmr6). A DNS-rebound browser issues a *same-origin*
 * request — so the OriginValidationGuard's lenient absent-Origin path lets it
 * through — but its Host header carries the attacker-controlled name. `Host` is
 * a browser-forbidden header (scripts cannot forge it), so a strict Host
 * allowlist fully closes the rebinding path while leaving non-browser clients
 * (curl, MCP-over-HTTP) untouched as long as they target a loopback name.
 *
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#security-warning
 *
 * Configuration:
 * - Built-in allowlist: `localhost`, `127.0.0.1`, `::1` (always accepted).
 * - `ALLOWED_HOSTS` env var (comma-separated) adds extra hostnames — required
 *   when binding to 0.0.0.0 / a public domain / behind a reverse proxy.
 * - Matching is hostname-only (port-agnostic) and case-insensitive.
 */
@Injectable()
export class HostValidationGuard implements CanActivate {
  private readonly logger = new Logger(HostValidationGuard.name);
  private readonly allowedHosts: Set<string>;

  /** Always-accepted loopback hostnames. */
  private static readonly LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "::1"];

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.allowedHosts = new Set(
      [
        ...HostValidationGuard.LOOPBACK_HOSTS,
        ...config.allowedHosts.map((host) =>
          HostValidationGuard.extractHostname(host),
        ),
      ].filter((host) => host.length > 0),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const hostHeader = request.headers.host;

    // A missing/blank Host header cannot be matched against the allowlist.
    // Reject rather than guess — legitimate clients always send one.
    if (!hostHeader || hostHeader.trim().length === 0) {
      this.logger.warn(
        "Rejected request with missing Host header (DNS-rebinding protection)",
      );
      return false;
    }

    const hostname = HostValidationGuard.extractHostname(hostHeader);

    if (this.allowedHosts.has(hostname)) {
      return true;
    }

    this.logger.warn(
      `Rejected request with disallowed Host header: "${hostHeader}". ` +
        `Allowed hosts are loopback by default; set ALLOWED_HOSTS ` +
        `(comma-separated hostnames) to permit additional hosts.`,
    );
    return false;
  }

  /**
   * Normalizes a Host value to a bare, lowercase hostname.
   * Strips the port and IPv6 brackets so matching is port-agnostic:
   *   `127.0.0.1:3000` -> `127.0.0.1`
   *   `[::1]:3000`     -> `::1`
   *   `Localhost`      -> `localhost`
   */
  private static extractHostname(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length === 0) {
      return "";
    }

    // Bracketed IPv6 literal, with or without a port: [::1] / [::1]:3000
    if (trimmed.startsWith("[")) {
      const closing = trimmed.indexOf("]");
      if (closing !== -1) {
        return trimmed.slice(1, closing);
      }
    }

    // For a bare IPv6 literal (multiple colons, no brackets) there is no port
    // to strip — keep it as-is. Otherwise strip a single trailing `:port`.
    const firstColon = trimmed.indexOf(":");
    const lastColon = trimmed.lastIndexOf(":");
    if (firstColon !== -1 && firstColon === lastColon) {
      return trimmed.slice(0, firstColon);
    }

    return trimmed;
  }
}
