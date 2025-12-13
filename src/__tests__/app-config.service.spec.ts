import { AppConfigService } from "../app-config.service";
import type { AppConfig } from "@/config";

describe("AppConfigService", () => {
  // Default config matching Zod defaults
  const defaultConfig: AppConfig = {
    port: 3000,
    host: "127.0.0.1",
    nodeEnv: "development",
    ankiConnect: {
      url: "http://localhost:8765",
      apiKey: undefined,
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
  };

  function createService(overrides: Partial<AppConfig> = {}): AppConfigService {
    const config = { ...defaultConfig, ...overrides };
    return new AppConfigService(config as AppConfig);
  }

  describe("server configuration", () => {
    it("should return port from config", () => {
      const service = createService({ port: 8080 });
      expect(service.port).toBe(8080);
    });

    it("should return host from config", () => {
      const service = createService({ host: "0.0.0.0" });
      expect(service.host).toBe("0.0.0.0");
    });

    it("should return nodeEnv from config", () => {
      const service = createService({ nodeEnv: "production" });
      expect(service.nodeEnv).toBe("production");
    });

    describe("environment helpers", () => {
      it("isDevelopment should return true when nodeEnv is development", () => {
        const service = createService({ nodeEnv: "development" });
        expect(service.isDevelopment).toBe(true);
        expect(service.isProduction).toBe(false);
        expect(service.isTest).toBe(false);
      });

      it("isProduction should return true when nodeEnv is production", () => {
        const service = createService({ nodeEnv: "production" });
        expect(service.isDevelopment).toBe(false);
        expect(service.isProduction).toBe(true);
        expect(service.isTest).toBe(false);
      });

      it("isTest should return true when nodeEnv is test", () => {
        const service = createService({ nodeEnv: "test" });
        expect(service.isDevelopment).toBe(false);
        expect(service.isProduction).toBe(false);
        expect(service.isTest).toBe(true);
      });
    });
  });

  describe("ankiConnect configuration (IAnkiConfig implementation)", () => {
    it("should return ankiConnectUrl from config", () => {
      const service = createService({
        ankiConnect: {
          ...defaultConfig.ankiConnect,
          url: "http://anki.example.com:8765",
        },
      });
      expect(service.ankiConnectUrl).toBe("http://anki.example.com:8765");
    });

    it("should return ankiConnectApiVersion from config", () => {
      const service = createService({
        ankiConnect: { ...defaultConfig.ankiConnect, apiVersion: 7 },
      });
      expect(service.ankiConnectApiVersion).toBe(7);
    });

    it("should return undefined ankiConnectApiKey when not set", () => {
      const service = createService();
      expect(service.ankiConnectApiKey).toBeUndefined();
    });

    it("should return ankiConnectApiKey when set", () => {
      const service = createService({
        ankiConnect: { ...defaultConfig.ankiConnect, apiKey: "test-key" },
      });
      expect(service.ankiConnectApiKey).toBe("test-key");
    });

    it("should return ankiConnectTimeout from config", () => {
      const service = createService({
        ankiConnect: { ...defaultConfig.ankiConnect, timeout: 10000 },
      });
      expect(service.ankiConnectTimeout).toBe(10000);
    });
  });

  describe("auth configuration", () => {
    it("should return authUrl from config", () => {
      const service = createService({
        auth: { ...defaultConfig.auth, url: "https://auth.example.com" },
      });
      expect(service.authUrl).toBe("https://auth.example.com");
    });

    it("should return authRealm from config", () => {
      const service = createService({
        auth: { ...defaultConfig.auth, realm: "test-realm" },
      });
      expect(service.authRealm).toBe("test-realm");
    });

    it("should return authClientId from config", () => {
      const service = createService({
        auth: { ...defaultConfig.auth, clientId: "test-client" },
      });
      expect(service.authClientId).toBe("test-client");
    });
  });

  describe("tunnel configuration", () => {
    it("should return tunnelServerUrl from config", () => {
      const service = createService({
        tunnel: { serverUrl: "wss://tunnel.example.com" },
      });
      expect(service.tunnelServerUrl).toBe("wss://tunnel.example.com");
    });
  });

  describe("logging configuration", () => {
    it("should return logLevel from config", () => {
      const service = createService({ logLevel: "debug" });
      expect(service.logLevel).toBe("debug");
    });
  });

  describe("default values", () => {
    it("should have correct defaults from Zod schema", () => {
      const service = createService();

      expect(service.port).toBe(3000);
      expect(service.host).toBe("127.0.0.1");
      expect(service.nodeEnv).toBe("development");
      expect(service.ankiConnectUrl).toBe("http://localhost:8765");
      expect(service.ankiConnectApiVersion).toBe(6);
      expect(service.ankiConnectTimeout).toBe(5000);
      expect(service.authUrl).toBe("https://keycloak.anatoly.dev");
      expect(service.authRealm).toBe("ankimcp-dev");
      expect(service.authClientId).toBe("ankimcp-cli");
      expect(service.tunnelServerUrl).toBe("wss://tunnel.ankimcp.ai");
      expect(service.logLevel).toBe("info");
    });
  });
});
