import { configSchema, transformEnvToConfig } from "../config.schema";
import { ZodError } from "zod";

describe("Config Schema", () => {
  describe("transformEnvToConfig", () => {
    it("should transform flat env vars into nested config structure", () => {
      const env = {
        PORT: "8080",
        HOST: "0.0.0.0",
        NODE_ENV: "production",
        ANKI_CONNECT_URL: "http://anki.example.com:8765",
        ANKI_CONNECT_API_KEY: "test-key",
        ANKI_CONNECT_API_VERSION: "6",
        ANKI_CONNECT_TIMEOUT: "10000",
        TUNNEL_AUTH_URL: "https://auth.example.com",
        TUNNEL_AUTH_REALM: "test-realm",
        TUNNEL_AUTH_CLIENT_ID: "test-client",
        TUNNEL_SERVER_URL: "wss://tunnel.example.com",
        LOG_LEVEL: "debug",
      };

      const config = transformEnvToConfig(env);

      expect(config).toEqual({
        port: "8080",
        host: "0.0.0.0",
        nodeEnv: "production",
        ankiConnect: {
          url: "http://anki.example.com:8765",
          apiKey: "test-key",
          apiVersion: "6",
          timeout: "10000",
        },
        auth: {
          url: "https://auth.example.com",
          realm: "test-realm",
          clientId: "test-client",
        },
        tunnel: {
          serverUrl: "wss://tunnel.example.com",
        },
        logLevel: "debug",
      });
    });

    it("should handle undefined values", () => {
      const config = transformEnvToConfig({});

      expect(config).toEqual({
        port: undefined,
        host: undefined,
        nodeEnv: undefined,
        ankiConnect: {
          url: undefined,
          apiKey: undefined,
          apiVersion: undefined,
          timeout: undefined,
        },
        auth: {
          url: undefined,
          realm: undefined,
          clientId: undefined,
        },
        tunnel: {
          serverUrl: undefined,
        },
        logLevel: undefined,
      });
    });
  });

  describe("configSchema validation", () => {
    describe("defaults", () => {
      it("should apply all defaults when no values provided", () => {
        const config = configSchema.parse({
          ankiConnect: {},
          auth: {},
          tunnel: {},
        });

        expect(config).toEqual({
          port: 3000,
          host: "127.0.0.1",
          nodeEnv: "development",
          ankiConnect: {
            url: "http://localhost:8765",
            apiVersion: 6,
            timeout: 5000,
          },
          auth: {
            url: "https://keycloak.anatoly.dev",
            realm: "ankimcp-dev",
            clientId: "ankimcp-cli",
          },
          tunnel: {
            serverUrl: "wss://tunnel.ankimcp.ai",
          },
          logLevel: "info",
        });
      });
    });

    describe("server config", () => {
      it("should accept valid port", () => {
        const config = configSchema.parse({
          port: 8080,
          ankiConnect: {},
          auth: {},
          tunnel: {},
        });

        expect(config.port).toBe(8080);
      });

      it("should coerce string port to number", () => {
        const config = configSchema.parse({
          port: "8080",
          ankiConnect: {},
          auth: {},
          tunnel: {},
        });

        expect(config.port).toBe(8080);
      });

      it("should reject negative port", () => {
        expect(() =>
          configSchema.parse({
            port: -1,
            ankiConnect: {},
            auth: {},
            tunnel: {},
          }),
        ).toThrow(ZodError);
      });

      it("should accept valid host", () => {
        const config = configSchema.parse({
          host: "0.0.0.0",
          ankiConnect: {},
          auth: {},
          tunnel: {},
        });

        expect(config.host).toBe("0.0.0.0");
      });

      it("should accept valid nodeEnv values", () => {
        const envs: Array<"development" | "production" | "test"> = [
          "development",
          "production",
          "test",
        ];

        envs.forEach((env) => {
          const config = configSchema.parse({
            nodeEnv: env,
            ankiConnect: {},
            auth: {},
            tunnel: {},
          });

          expect(config.nodeEnv).toBe(env);
        });
      });

      it("should reject invalid nodeEnv", () => {
        expect(() =>
          configSchema.parse({
            nodeEnv: "invalid",
            ankiConnect: {},
            auth: {},
            tunnel: {},
          }),
        ).toThrow(ZodError);
      });
    });

    describe("ankiConnect config", () => {
      it("should accept valid AnkiConnect config", () => {
        const config = configSchema.parse({
          ankiConnect: {
            url: "http://anki.example.com:8765",
            apiKey: "test-key",
            apiVersion: 6,
            timeout: 10000,
          },
          auth: {},
          tunnel: {},
        });

        expect(config.ankiConnect).toEqual({
          url: "http://anki.example.com:8765",
          apiKey: "test-key",
          apiVersion: 6,
          timeout: 10000,
        });
      });

      it("should coerce string values to numbers", () => {
        const config = configSchema.parse({
          ankiConnect: {
            apiVersion: "7",
            timeout: "15000",
          },
          auth: {},
          tunnel: {},
        });

        expect(config.ankiConnect.apiVersion).toBe(7);
        expect(config.ankiConnect.timeout).toBe(15000);
      });

      it("should reject invalid URL", () => {
        expect(() =>
          configSchema.parse({
            ankiConnect: {
              url: "not-a-url",
            },
            auth: {},
            tunnel: {},
          }),
        ).toThrow(ZodError);
      });

      it("should accept optional apiKey", () => {
        const config = configSchema.parse({
          ankiConnect: {},
          auth: {},
          tunnel: {},
        });

        expect(config.ankiConnect.apiKey).toBeUndefined();
      });

      it("should reject negative timeout", () => {
        expect(() =>
          configSchema.parse({
            ankiConnect: {
              timeout: -1000,
            },
            auth: {},
            tunnel: {},
          }),
        ).toThrow(ZodError);
      });
    });

    describe("auth config", () => {
      it("should accept valid auth config", () => {
        const config = configSchema.parse({
          auth: {
            url: "https://auth.example.com",
            realm: "test-realm",
            clientId: "test-client",
          },
          ankiConnect: {},
          tunnel: {},
        });

        expect(config.auth).toEqual({
          url: "https://auth.example.com",
          realm: "test-realm",
          clientId: "test-client",
        });
      });

      it("should reject invalid auth URL", () => {
        expect(() =>
          configSchema.parse({
            auth: {
              url: "not-a-url",
            },
            ankiConnect: {},
            tunnel: {},
          }),
        ).toThrow(ZodError);
      });
    });

    describe("tunnel config", () => {
      it("should accept valid tunnel config", () => {
        const config = configSchema.parse({
          tunnel: {
            serverUrl: "wss://tunnel.example.com",
          },
          ankiConnect: {},
          auth: {},
        });

        expect(config.tunnel.serverUrl).toBe("wss://tunnel.example.com");
      });

      it("should reject invalid tunnel URL", () => {
        expect(() =>
          configSchema.parse({
            tunnel: {
              serverUrl: "not-a-url",
            },
            ankiConnect: {},
            auth: {},
          }),
        ).toThrow(ZodError);
      });
    });

    describe("logging config", () => {
      it("should accept valid log levels", () => {
        const levels: Array<"debug" | "info" | "warn" | "error"> = [
          "debug",
          "info",
          "warn",
          "error",
        ];

        levels.forEach((level) => {
          const config = configSchema.parse({
            logLevel: level,
            ankiConnect: {},
            auth: {},
            tunnel: {},
          });

          expect(config.logLevel).toBe(level);
        });
      });

      it("should reject invalid log level", () => {
        expect(() =>
          configSchema.parse({
            logLevel: "invalid",
            ankiConnect: {},
            auth: {},
            tunnel: {},
          }),
        ).toThrow(ZodError);
      });
    });

    describe("full integration", () => {
      it("should validate complete config from transformed env", () => {
        const env = {
          PORT: "3000",
          HOST: "127.0.0.1",
          NODE_ENV: "production",
          ANKI_CONNECT_URL: "http://localhost:8765",
          ANKI_CONNECT_API_KEY: "secret-key",
          ANKI_CONNECT_API_VERSION: "6",
          ANKI_CONNECT_TIMEOUT: "5000",
          TUNNEL_AUTH_URL: "https://keycloak.anatoly.dev",
          TUNNEL_AUTH_REALM: "ankimcp-dev",
          TUNNEL_AUTH_CLIENT_ID: "ankimcp-cli",
          TUNNEL_SERVER_URL: "wss://tunnel.ankimcp.ai",
          LOG_LEVEL: "info",
        };

        const transformed = transformEnvToConfig(env);
        const config = configSchema.parse(transformed);

        expect(config).toMatchObject({
          port: 3000,
          host: "127.0.0.1",
          nodeEnv: "production",
          ankiConnect: {
            url: "http://localhost:8765",
            apiKey: "secret-key",
            apiVersion: 6,
            timeout: 5000,
          },
          auth: {
            url: "https://keycloak.anatoly.dev",
            realm: "ankimcp-dev",
            clientId: "ankimcp-cli",
          },
          tunnel: {
            serverUrl: "wss://tunnel.ankimcp.ai",
          },
          logLevel: "info",
        });
      });

      it("should validate partial config with defaults", () => {
        const env = {
          PORT: "8080",
          NODE_ENV: "test",
        };

        const transformed = transformEnvToConfig(env);
        const config = configSchema.parse(transformed);

        expect(config.port).toBe(8080);
        expect(config.nodeEnv).toBe("test");
        expect(config.host).toBe("127.0.0.1"); // default
        expect(config.ankiConnect.url).toBe("http://localhost:8765"); // default
        expect(config.logLevel).toBe("info"); // default
      });
    });
  });
});
