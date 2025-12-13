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
      process.env.TUNNEL_AUTH_URL = "https://auth.test";
      process.env.TUNNEL_AUTH_REALM = "test-realm";
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
        TUNNEL_AUTH_URL: "https://auth.test",
        TUNNEL_AUTH_REALM: "test-realm",
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
      delete process.env.TUNNEL_AUTH_URL;
      delete process.env.TUNNEL_AUTH_REALM;
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
      expect(result.TUNNEL_AUTH_URL).toBeUndefined();
      expect(result.TUNNEL_AUTH_REALM).toBeUndefined();
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

  describe("loadValidatedConfig", () => {
    it("should build and validate config in one step", () => {
      process.env.PORT = "3000";
      process.env.HOST = "127.0.0.1";
      process.env.NODE_ENV = "production";
      process.env.ANKI_CONNECT_URL = "http://localhost:8765";
      process.env.TUNNEL_AUTH_URL = "https://auth.test";
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
          url: "https://auth.test",
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
      delete process.env.TUNNEL_AUTH_URL;
      delete process.env.TUNNEL_SERVER_URL;
      delete process.env.LOG_LEVEL;

      const config = loadValidatedConfig();

      // Should get all defaults from schema
      expect(config.port).toBe(3000);
      expect(config.host).toBe("127.0.0.1");
      expect(config.nodeEnv).toBe("development");
      expect(config.ankiConnect.url).toBe("http://localhost:8765");
      expect(config.auth.url).toBe("https://keycloak.anatoly.dev");
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
