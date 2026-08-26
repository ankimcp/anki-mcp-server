import {
  buildConfigInput,
  loadValidatedConfig,
  CliOverrides,
} from "../config.factory";

describe("Config Factory", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Create a clean copy of process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
  });

  describe("buildConfigInput", () => {
    it("should read all environment variables from process.env", () => {
      process.env.PORT = "8080";
      process.env.HOST = "0.0.0.0";
      process.env.NODE_ENV = "production";
      process.env.ANKI_CONNECT_URL = "http://anki.test:8765";
      process.env.ANKI_CONNECT_API_KEY = "test-key";
      process.env.ANKI_CONNECT_API_VERSION = "7";
      process.env.ANKI_CONNECT_TIMEOUT = "10000";
      process.env.TUNNEL_AUTH_CLIENT_ID = "test-client";
      process.env.TUNNEL_SERVER_URL = "wss://tunnel.test";
      process.env.LOG_LEVEL = "debug";

      const result = buildConfigInput();

      // Verify all config env vars are passed through
      expect(result).toMatchObject({
        PORT: "8080",
        HOST: "0.0.0.0",
        NODE_ENV: "production",
        ANKI_CONNECT_URL: "http://anki.test:8765",
        ANKI_CONNECT_API_KEY: "test-key",
        ANKI_CONNECT_API_VERSION: "7",
        ANKI_CONNECT_TIMEOUT: "10000",
        TUNNEL_AUTH_CLIENT_ID: "test-client",
        TUNNEL_SERVER_URL: "wss://tunnel.test",
        LOG_LEVEL: "debug",
      });
    });

    it("should handle missing environment variables as undefined", () => {
      // Clear all relevant env vars
      delete process.env.PORT;
      delete process.env.HOST;
      delete process.env.NODE_ENV;
      delete process.env.ANKI_CONNECT_URL;
      delete process.env.ANKI_CONNECT_API_KEY;
      delete process.env.ANKI_CONNECT_API_VERSION;
      delete process.env.ANKI_CONNECT_TIMEOUT;
      delete process.env.TUNNEL_AUTH_CLIENT_ID;
      delete process.env.TUNNEL_SERVER_URL;
      delete process.env.LOG_LEVEL;

      const result = buildConfigInput();

      // Deleted env vars should be undefined in result
      expect(result.PORT).toBeUndefined();
      expect(result.HOST).toBeUndefined();
      expect(result.NODE_ENV).toBeUndefined();
      expect(result.ANKI_CONNECT_URL).toBeUndefined();
      expect(result.ANKI_CONNECT_API_KEY).toBeUndefined();
      expect(result.ANKI_CONNECT_API_VERSION).toBeUndefined();
      expect(result.ANKI_CONNECT_TIMEOUT).toBeUndefined();
      expect(result.TUNNEL_AUTH_CLIENT_ID).toBeUndefined();
      expect(result.TUNNEL_SERVER_URL).toBeUndefined();
      expect(result.LOG_LEVEL).toBeUndefined();
    });

    it("should apply CLI overrides over environment variables", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";
      process.env.ANKI_CONNECT_URL = "http://localhost:8765";
      process.env.TUNNEL_SERVER_URL = "wss://default.tunnel";

      const cliOverrides: CliOverrides = {
        port: 8080,
        host: "0.0.0.0",
        ankiConnect: "http://custom.anki:8765",
        tunnel: "wss://custom.tunnel",
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.PORT).toBe("8080");
      expect(result.HOST).toBe("0.0.0.0");
      expect(result.ANKI_CONNECT_URL).toBe("http://custom.anki:8765");
      expect(result.TUNNEL_SERVER_URL).toBe("wss://custom.tunnel");
    });

    it("should only override specified CLI values", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";
      process.env.ANKI_CONNECT_URL = "http://localhost:8765";

      const cliOverrides: CliOverrides = {
        port: 8080,
        // host not specified - should keep env value
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.PORT).toBe("8080"); // overridden
      expect(result.HOST).toBe("127.0.0.1"); // from env
      expect(result.ANKI_CONNECT_URL).toBe("http://localhost:8765"); // from env
    });

    it("should handle tunnel CLI override as string", () => {
      process.env.TUNNEL_SERVER_URL = "wss://default.tunnel";

      const cliOverrides: CliOverrides = {
        tunnel: "wss://cli.tunnel",
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.TUNNEL_SERVER_URL).toBe("wss://cli.tunnel");
    });

    it("should ignore tunnel CLI override when boolean true", () => {
      process.env.TUNNEL_SERVER_URL = "wss://default.tunnel";

      const cliOverrides: CliOverrides = {
        tunnel: true, // boolean, not string
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.TUNNEL_SERVER_URL).toBe("wss://default.tunnel"); // unchanged
    });

    it("should ignore tunnel CLI override when boolean false", () => {
      process.env.TUNNEL_SERVER_URL = "wss://default.tunnel";

      const cliOverrides: CliOverrides = {
        tunnel: false,
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.TUNNEL_SERVER_URL).toBe("wss://default.tunnel"); // unchanged
    });

    it("should NOT mutate process.env", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";

      const cliOverrides: CliOverrides = {
        port: 8080,
        host: "0.0.0.0",
      };

      buildConfigInput(cliOverrides);

      // Verify process.env was NOT modified
      expect(process.env.PORT).toBe("3000");
      expect(process.env.HOST).toBe("127.0.0.1");
    });

    it("should handle empty CLI overrides", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";

      const result = buildConfigInput({});

      expect(result.PORT).toBe("3000");
      expect(result.HOST).toBe("127.0.0.1");
    });

    it("should set LOG_LEVEL to debug when debug: true", () => {
      process.env.LOG_LEVEL = "info";

      const cliOverrides: CliOverrides = {
        debug: true,
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.LOG_LEVEL).toBe("debug");
    });

    it("should not override LOG_LEVEL when debug: false", () => {
      process.env.LOG_LEVEL = "info";

      const cliOverrides: CliOverrides = {
        debug: false,
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.LOG_LEVEL).toBe("info"); // unchanged
    });

    it("should override existing LOG_LEVEL env var when debug: true", () => {
      process.env.LOG_LEVEL = "error";

      const cliOverrides: CliOverrides = {
        debug: true,
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.LOG_LEVEL).toBe("debug"); // overridden
    });

    it("should set LOG_LEVEL to debug when debug: true and no LOG_LEVEL env", () => {
      delete process.env.LOG_LEVEL;

      const cliOverrides: CliOverrides = {
        debug: true,
      };

      const result = buildConfigInput(cliOverrides);

      expect(result.LOG_LEVEL).toBe("debug");
    });
  });

  /**
   * Regression coverage for the PORT/HOST env var bug: Commander previously
   * gave --port/--host hardcoded defaults ("3000" / "127.0.0.1"), so
   * cliOverrides.port/host were *never* undefined and buildConfigInput()
   * always overrode PORT/HOST, silently ignoring the env vars. Precedence
   * must be CLI flag > env var > schema default.
   */
  describe("PORT/HOST precedence (CLI flag > env var > schema default)", () => {
    it("uses PORT/HOST env vars when no CLI flag is given", () => {
      process.env.PORT = "39218";
      process.env.HOST = "0.0.0.0";

      const config = loadValidatedConfig({});

      expect(config.port).toBe(39218);
      expect(config.host).toBe("0.0.0.0");
    });

    it("CLI flag overrides PORT/HOST env vars when both are set", () => {
      process.env.PORT = "39218";
      process.env.HOST = "0.0.0.0";

      const config = loadValidatedConfig({ port: 9999, host: "192.168.1.1" });

      expect(config.port).toBe(9999);
      expect(config.host).toBe("192.168.1.1");
    });

    it("falls back to the schema default (3000 / 127.0.0.1) when neither CLI flag nor env var is set", () => {
      delete process.env.PORT;
      delete process.env.HOST;

      const config = loadValidatedConfig({});

      expect(config.port).toBe(3000);
      expect(config.host).toBe("127.0.0.1");
    });

    it("buildConfigInput leaves PORT/HOST untouched when cliOverrides.port/host are undefined", () => {
      process.env.PORT = "39218";
      process.env.HOST = "0.0.0.0";

      const result = buildConfigInput({ port: undefined, host: undefined });

      expect(result.PORT).toBe("39218");
      expect(result.HOST).toBe("0.0.0.0");
    });
  });

  /**
   * Regression coverage for the same env-var-clobber bug affecting
   * ANKI_CONNECT_URL: Commander's `-a, --anki-connect` used to carry a
   * hardcoded default ("http://localhost:8765"), so cliOverrides.ankiConnect
   * was *never* undefined and buildConfigInput() always overrode
   * ANKI_CONNECT_URL, silently ignoring the env var. Precedence must be CLI
   * flag > env var > schema default.
   */
  describe("ANKI_CONNECT_URL precedence (CLI flag > env var > schema default)", () => {
    it("uses ANKI_CONNECT_URL env var when no CLI flag is given", () => {
      process.env.ANKI_CONNECT_URL = "http://anki.env:8765";

      const config = loadValidatedConfig({});

      expect(config.ankiConnect.url).toBe("http://anki.env:8765");
    });

    it("CLI flag overrides ANKI_CONNECT_URL env var when both are set", () => {
      process.env.ANKI_CONNECT_URL = "http://anki.env:8765";

      const config = loadValidatedConfig({
        ankiConnect: "http://anki.cli:8765",
      });

      expect(config.ankiConnect.url).toBe("http://anki.cli:8765");
    });

    it("falls back to the schema default (http://localhost:8765) when neither CLI flag nor env var is set", () => {
      delete process.env.ANKI_CONNECT_URL;

      const config = loadValidatedConfig({});

      expect(config.ankiConnect.url).toBe("http://localhost:8765");
    });

    it("buildConfigInput leaves ANKI_CONNECT_URL untouched when cliOverrides.ankiConnect is undefined", () => {
      process.env.ANKI_CONNECT_URL = "http://anki.env:8765";

      const result = buildConfigInput({ ankiConnect: undefined });

      expect(result.ANKI_CONNECT_URL).toBe("http://anki.env:8765");
    });
  });

  /**
   * Blank PORT/HOST env vars (e.g. `PORT=""` from an unset shell variable
   * interpolated into a `.env` file) must fall through to the schema default
   * rather than crashing coercion (PORT) or binding all interfaces (HOST).
   */
  describe("blank PORT/HOST env vars fall back to schema defaults", () => {
    it("falls back to the default port when PORT is a blank string", () => {
      process.env.PORT = "";

      const config = loadValidatedConfig({});

      expect(config.port).toBe(3000);
    });

    it("falls back to the default host when HOST is a blank string", () => {
      process.env.HOST = "";

      const config = loadValidatedConfig({});

      expect(config.host).toBe("127.0.0.1");
    });

    it("falls back to the default AnkiConnect URL when ANKI_CONNECT_URL is a blank string", () => {
      process.env.ANKI_CONNECT_URL = "";

      const config = loadValidatedConfig({});

      expect(config.ankiConnect.url).toBe("http://localhost:8765");
    });

    it("falls back to the default tunnel server URL when TUNNEL_SERVER_URL is a blank string", () => {
      process.env.TUNNEL_SERVER_URL = "";

      const config = loadValidatedConfig({});

      expect(config.tunnel.serverUrl).toBe("wss://tunnel.ankimcp.ai");
    });

    it("falls back to the default AnkiConnect API version when ANKI_CONNECT_API_VERSION is a blank string", () => {
      process.env.ANKI_CONNECT_API_VERSION = "";

      const config = loadValidatedConfig({});

      expect(config.ankiConnect.apiVersion).toBe(6);
    });

    it("falls back to the default AnkiConnect timeout when ANKI_CONNECT_TIMEOUT is a blank string", () => {
      process.env.ANKI_CONNECT_TIMEOUT = "";

      const config = loadValidatedConfig({});

      expect(config.ankiConnect.timeout).toBe(5000);
    });
  });

  describe("loadValidatedConfig", () => {
    it("should build and validate config in one step", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";
      process.env.NODE_ENV = "production";
      process.env.ANKI_CONNECT_URL = "http://localhost:8765";
      process.env.TUNNEL_AUTH_CLIENT_ID = "test-client";
      process.env.TUNNEL_SERVER_URL = "wss://tunnel.test";
      process.env.LOG_LEVEL = "info";

      const config = loadValidatedConfig();

      expect(config).toMatchObject({
        port: 3000,
        host: "127.0.0.1",
        nodeEnv: "production",
        ankiConnect: {
          url: "http://localhost:8765",
          apiVersion: 6, // default
          timeout: 5000, // default
        },
        auth: {
          clientId: "test-client",
        },
        tunnel: {
          serverUrl: "wss://tunnel.test",
        },
        logLevel: "info",
      });
    });

    it("should apply CLI overrides before validation", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";

      const cliOverrides: CliOverrides = {
        port: 8080,
        ankiConnect: "http://custom.anki:8765",
      };

      const config = loadValidatedConfig(cliOverrides);

      expect(config.port).toBe(8080);
      expect(config.ankiConnect.url).toBe("http://custom.anki:8765");
    });

    it("should apply defaults for missing values", () => {
      // Clear all env vars
      delete process.env.PORT;
      delete process.env.HOST;
      delete process.env.NODE_ENV;
      delete process.env.ANKI_CONNECT_URL;
      delete process.env.TUNNEL_AUTH_CLIENT_ID;
      delete process.env.TUNNEL_SERVER_URL;
      delete process.env.LOG_LEVEL;

      const config = loadValidatedConfig();

      // Should get all defaults from schema
      expect(config.port).toBe(3000);
      expect(config.host).toBe("127.0.0.1");
      expect(config.nodeEnv).toBe("development");
      expect(config.ankiConnect.url).toBe("http://localhost:8765");
      expect(config.auth.clientId).toBe("ankimcp-cli");
      expect(config.tunnel.serverUrl).toBe("wss://tunnel.ankimcp.ai");
      expect(config.logLevel).toBe("info");
    });

    it("should throw validation error for invalid config", () => {
      process.env.PORT = "-1"; // invalid port
      process.env.ANKI_CONNECT_URL = "not-a-url"; // invalid URL

      expect(() => loadValidatedConfig()).toThrow();
    });

    it("should validate CLI overrides", () => {
      const cliOverrides: CliOverrides = {
        port: -1, // invalid
      };

      expect(() => loadValidatedConfig(cliOverrides)).toThrow();
    });
  });
});
