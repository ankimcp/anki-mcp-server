import { ExecutionContext } from "@nestjs/common";
import {
  HostValidationGuard,
  shouldWarnLoopbackOnly,
} from "../host-validation.guard";
import type { AppConfig } from "@/config";

/**
 * Unit tests for HostValidationGuard (DNS-rebinding protection, advisory
 * GHSA-j9xx-59ph-wmr6) and the fail-closed startup-warning helper.
 *
 * The integration tier (dns-rebinding.integration.spec.ts) proves the guard is
 * wired into AppModule.forHttp() and rejects/serves real requests. This tier
 * exercises the matching logic directly against a fabricated ExecutionContext,
 * mirroring origin-validation.guard.spec.ts.
 */

/**
 * Builds a guard from a minimal AppConfig stub. Only `allowedHosts` is read by
 * the constructor, so the rest of AppConfig is cast away — the same shape the
 * APP_CONFIG provider supplies at runtime.
 */
function buildGuard(allowedHosts: string[] = []): HostValidationGuard {
  return new HostValidationGuard({ allowedHosts } as AppConfig);
}

/**
 * Fabricates an ExecutionContext exposing the given Host header. Passing
 * `undefined` omits the header entirely (the absent-Host case).
 */
function createMockContext(host?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (host !== undefined) headers.host = host;

  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as ExecutionContext;
}

describe("HostValidationGuard", () => {
  describe("canActivate — loopback defaults (allow)", () => {
    const allowed = [
      "localhost",
      "localhost:3000",
      "LOCALHOST:8080",
      "127.0.0.1",
      "127.0.0.1:3000",
      "::1",
      "[::1]",
      "[::1]:3000",
    ];

    it.each(allowed)("allows loopback Host %p", (host) => {
      const guard = buildGuard();
      expect(guard.canActivate(createMockContext(host))).toBe(true);
    });
  });

  describe("canActivate — rebinding / edge forms (reject)", () => {
    const rejected = [
      "attacker.example",
      "attacker.example:3000",
      "localhost.", // trailing dot — not a loopback literal
      "0:0:0:0:0:0:0:1", // expanded IPv6 loopback, not the ::1 literal
      "[::ffff:127.0.0.1]", // IPv4-mapped IPv6 — not a literal match
      "127.1", // shorthand IPv4 — not the dotted-quad literal
      "2130706433", // decimal-encoded 127.0.0.1
      "127.000.000.001", // zero-padded — not the literal
      "localhost@evil.com", // userinfo trick
      "example.com", // a normal external domain
    ];

    it.each(rejected)("rejects disallowed Host %p", (host) => {
      const guard = buildGuard();
      expect(guard.canActivate(createMockContext(host))).toBe(false);
    });

    it("rejects an absent Host header", () => {
      const guard = buildGuard();
      expect(guard.canActivate(createMockContext(undefined))).toBe(false);
    });

    it("rejects a blank Host header", () => {
      const guard = buildGuard();
      expect(guard.canActivate(createMockContext(""))).toBe(false);
    });

    it("rejects a whitespace-only Host header", () => {
      const guard = buildGuard();
      expect(guard.canActivate(createMockContext("   "))).toBe(false);
    });
  });

  describe("canActivate — ALLOWED_HOSTS merge", () => {
    const guard = buildGuard(["foo.local", "BAR.LOCAL:9000"]);

    it("allows a configured host (port-stripped)", () => {
      expect(guard.canActivate(createMockContext("foo.local"))).toBe(true);
      expect(guard.canActivate(createMockContext("foo.local:1234"))).toBe(true);
    });

    it("allows a configured host case-folded and port-stripped", () => {
      // Configured as "BAR.LOCAL:9000"; matches case-insensitively, any port.
      expect(guard.canActivate(createMockContext("bar.local"))).toBe(true);
      expect(guard.canActivate(createMockContext("bar.local:9000"))).toBe(true);
    });

    it("still allows the loopback defaults", () => {
      expect(guard.canActivate(createMockContext("localhost"))).toBe(true);
      expect(guard.canActivate(createMockContext("127.0.0.1:3000"))).toBe(true);
      expect(guard.canActivate(createMockContext("[::1]"))).toBe(true);
    });

    it("still rejects a host not in the list", () => {
      expect(guard.canActivate(createMockContext("attacker.example"))).toBe(
        false,
      );
    });
  });
});

describe("shouldWarnLoopbackOnly", () => {
  it("returns false for a loopback bind with no allowed hosts", () => {
    expect(shouldWarnLoopbackOnly("localhost", [])).toBe(false);
    expect(shouldWarnLoopbackOnly("127.0.0.1", [])).toBe(false);
    expect(shouldWarnLoopbackOnly("::1", [])).toBe(false);
  });

  it("returns true for 0.0.0.0 with no allowed hosts", () => {
    expect(shouldWarnLoopbackOnly("0.0.0.0", [])).toBe(true);
  });

  it("returns false for 0.0.0.0 when allowed hosts are configured", () => {
    expect(shouldWarnLoopbackOnly("0.0.0.0", ["my.host"])).toBe(false);
  });

  it("returns true for a concrete LAN bind with no allowed hosts (broadened check)", () => {
    expect(shouldWarnLoopbackOnly("192.168.1.50", [])).toBe(true);
  });

  it("returns true for :: with no allowed hosts", () => {
    expect(shouldWarnLoopbackOnly("::", [])).toBe(true);
  });
});
