import { ExecutionContext } from "@nestjs/common";
import {
  configSchema,
  transformEnvToConfig,
  buildConfigInput,
  type AppConfig,
} from "@/config";

// Mock Logger BEFORE importing OriginValidationGuard
const mockLoggerWarn = jest.fn();
const mockLoggerLog = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock("@nestjs/common", () => {
  const actual = jest.requireActual("@nestjs/common");
  return {
    ...actual,
    Logger: jest.fn().mockImplementation(() => ({
      log: mockLoggerLog,
      warn: mockLoggerWarn,
      error: mockLoggerError,
      debug: mockLoggerDebug,
    })),
  };
});

import { OriginValidationGuard } from "../origin-validation.guard";

/**
 * Builds a guard from the current process.env, exercising the same Zod config
 * path the app uses (ALLOWED_ORIGINS -> validated config.allowedOrigins).
 */
function buildGuard(): OriginValidationGuard {
  const config: AppConfig = configSchema.parse(
    transformEnvToConfig(buildConfigInput()),
  );
  return new OriginValidationGuard(config);
}

describe("OriginValidationGuard", () => {
  let guard: OriginValidationGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear logger mocks
    mockLoggerWarn.mockClear();
    mockLoggerLog.mockClear();
    mockLoggerError.mockClear();
    mockLoggerDebug.mockClear();

    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.ALLOWED_ORIGINS;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe("constructor", () => {
    it("should use default allowed origins when ALLOWED_ORIGINS not set", () => {
      guard = buildGuard();

      // Test that default origins work
      const context = createMockContext("http://localhost:3000");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should use custom allowed origins from environment variable", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com,https://test.com:8080";
      guard = buildGuard();

      const context = createMockContext("https://example.com");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should trim whitespace from allowed origins", () => {
      process.env.ALLOWED_ORIGINS = " https://example.com , https://test.com ";
      guard = buildGuard();

      const context = createMockContext("https://example.com");
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("canActivate", () => {
    beforeEach(() => {
      guard = buildGuard();
    });

    it("should allow request with no origin header", () => {
      const context = createMockContext(undefined);

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow localhost HTTP origin", () => {
      const context = createMockContext("http://localhost:3000");

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow localhost HTTPS origin", () => {
      const context = createMockContext("https://localhost:3000");

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow 127.0.0.1 HTTP origin", () => {
      const context = createMockContext("http://127.0.0.1:3000");

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow 127.0.0.1 HTTPS origin", () => {
      const context = createMockContext("https://127.0.0.1:8080");

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should require wildcard pattern to match localhost without explicit port", () => {
      // Note: Default pattern is 'http://localhost:*' which requires a port
      // 'http://localhost' (no port) won't match unless explicitly configured
      process.env.ALLOWED_ORIGINS = "http://localhost,http://localhost:*";
      guard = buildGuard();

      const context = createMockContext("http://localhost");
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow localhost with any port (wildcard)", () => {
      const context1 = createMockContext("http://localhost:3000");
      const context2 = createMockContext("http://localhost:8080");
      const context3 = createMockContext("http://localhost:9999");

      expect(guard.canActivate(context1)).toBe(true);
      expect(guard.canActivate(context2)).toBe(true);
      expect(guard.canActivate(context3)).toBe(true);
    });

    it("should block unauthorized origin", () => {
      const context = createMockContext("https://evil.com");

      expect(guard.canActivate(context)).toBe(false);
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Rejected request from unauthorized origin"),
      );
    });

    it("should block HTTP request from external domain", () => {
      const context = createMockContext("http://example.com");

      expect(guard.canActivate(context)).toBe(false);
    });

    it("should block HTTPS request from external domain", () => {
      const context = createMockContext("https://example.com");

      expect(guard.canActivate(context)).toBe(false);
    });

    it("should use referer header when origin is missing", () => {
      const context = createMockContext(undefined, "http://localhost:3000");

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should prefer origin over referer when both present", () => {
      const context = createMockContext(
        "http://localhost:3000",
        "https://evil.com",
      );

      // Should use origin (localhost) which is allowed
      expect(guard.canActivate(context)).toBe(true);
    });

    it("should allow ngrok origins when configured", () => {
      process.env.ALLOWED_ORIGINS = "https://*.ngrok.io";
      guard = buildGuard();

      const context1 = createMockContext("https://abc123.ngrok.io");
      const context2 = createMockContext("https://xyz789.ngrok.io");

      expect(guard.canActivate(context1)).toBe(true);
      expect(guard.canActivate(context2)).toBe(true);
    });

    it("should block non-matching ngrok subdomain", () => {
      process.env.ALLOWED_ORIGINS = "https://abc123.ngrok.io";
      guard = buildGuard();

      const context = createMockContext("https://xyz789.ngrok.io");

      expect(guard.canActivate(context)).toBe(false);
    });
  });

  describe("matchesPattern", () => {
    beforeEach(() => {
      guard = buildGuard();
    });

    it("should match exact origin", () => {
      const context = createMockContext("https://example.com:3000");
      process.env.ALLOWED_ORIGINS = "https://example.com:3000";
      guard = buildGuard();

      expect(guard.canActivate(context)).toBe(true);
    });

    it("should match wildcard port pattern", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com:*";
      guard = buildGuard();

      const context1 = createMockContext("https://example.com:3000");
      const context2 = createMockContext("https://example.com:8080");

      expect(guard.canActivate(context1)).toBe(true);
      expect(guard.canActivate(context2)).toBe(true);
    });

    it("should match wildcard subdomain pattern", () => {
      process.env.ALLOWED_ORIGINS = "https://*.example.com";
      guard = buildGuard();

      const context1 = createMockContext("https://api.example.com");
      const context2 = createMockContext("https://app.example.com");

      expect(guard.canActivate(context1)).toBe(true);
      expect(guard.canActivate(context2)).toBe(true);
    });

    it("should not match different protocol", () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:*";
      guard = buildGuard();

      const context = createMockContext("https://localhost:3000");

      expect(guard.canActivate(context)).toBe(false);
    });

    it("should not match different host", () => {
      process.env.ALLOWED_ORIGINS = "http://localhost:*";
      guard = buildGuard();

      const context = createMockContext("http://example.com:3000");

      expect(guard.canActivate(context)).toBe(false);
    });

    it("should handle multiple wildcard patterns", () => {
      process.env.ALLOWED_ORIGINS = "https://*.ngrok.io,https://*.example.com";
      guard = buildGuard();

      const context1 = createMockContext("https://abc.ngrok.io");
      const context2 = createMockContext("https://app.example.com");
      const context3 = createMockContext("https://evil.com");

      expect(guard.canActivate(context1)).toBe(true);
      expect(guard.canActivate(context2)).toBe(true);
      expect(guard.canActivate(context3)).toBe(false);
    });

    it("should escape dots in pattern correctly", () => {
      process.env.ALLOWED_ORIGINS = "https://app.example.com";
      guard = buildGuard();

      // Should not match 'app-example.com' or 'appaexampleacom'
      const context1 = createMockContext("https://app-example.com");
      const context2 = createMockContext("https://appaexampleacom");
      const context3 = createMockContext("https://app.example.com"); // Should match

      expect(guard.canActivate(context1)).toBe(false);
      expect(guard.canActivate(context2)).toBe(false);
      expect(guard.canActivate(context3)).toBe(true);
    });
  });

  describe("security scenarios", () => {
    beforeEach(() => {
      guard = buildGuard();
    });

    it("should block DNS rebinding attack attempts", () => {
      const maliciousOrigins = [
        "http://evil.com",
        "https://malicious.site",
        "http://192.168.1.100:3000", // Attacker's local network
        "http://10.0.0.1:3000", // Private network
      ];

      maliciousOrigins.forEach((origin) => {
        const context = createMockContext(origin);
        expect(guard.canActivate(context)).toBe(false);
      });
    });

    it("should allow only configured safe origins", () => {
      const safeOrigins = [
        "http://localhost:3000",
        "https://localhost:8080",
        "http://127.0.0.1:3000",
        "https://127.0.0.1:9999",
      ];

      safeOrigins.forEach((origin) => {
        const context = createMockContext(origin);
        expect(guard.canActivate(context)).toBe(true);
      });
    });

    it("should log warning for blocked origins", () => {
      const context = createMockContext("https://malicious.com");
      guard.canActivate(context);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Rejected request from unauthorized origin: https://malicious.com",
      );
    });
  });
});

/**
 * Helper function to create a mock ExecutionContext for testing
 */
function createMockContext(
  origin?: string,
  referer?: string,
): ExecutionContext {
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  if (referer) headers.referer = referer;

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
      }),
    }),
  } as ExecutionContext;
}
