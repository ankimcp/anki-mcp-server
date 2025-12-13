import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AppConfigService } from "../app-config.service";

describe("AppConfigService", () => {
  let service: AppConfigService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [AppConfigService],
    }).compile();

    service = module.get<AppConfigService>(AppConfigService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("server configuration", () => {
    it("should return default port when PORT not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "PORT" ? defaultValue : undefined;
        });
      expect(service.port).toBe(3000);
    });

    it("should return PORT env value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "PORT" ? 8080 : undefined;
      });
      expect(service.port).toBe(8080);
    });

    it("should return default host when HOST not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "HOST" ? defaultValue : undefined;
        });
      expect(service.host).toBe("127.0.0.1");
    });

    it("should return HOST env value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "HOST" ? "0.0.0.0" : undefined;
      });
      expect(service.host).toBe("0.0.0.0");
    });

    it("should return default nodeEnv when NODE_ENV not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "NODE_ENV" ? defaultValue : undefined;
        });
      expect(service.nodeEnv).toBe("development");
    });

    it("should return NODE_ENV value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "NODE_ENV" ? "production" : undefined;
      });
      expect(service.nodeEnv).toBe("production");
    });

    describe("environment helpers", () => {
      it("isDevelopment should return true when NODE_ENV is development", () => {
        jest.spyOn(configService, "get").mockImplementation((key: string) => {
          return key === "NODE_ENV" ? "development" : undefined;
        });
        expect(service.isDevelopment).toBe(true);
        expect(service.isProduction).toBe(false);
        expect(service.isTest).toBe(false);
      });

      it("isProduction should return true when NODE_ENV is production", () => {
        jest.spyOn(configService, "get").mockImplementation((key: string) => {
          return key === "NODE_ENV" ? "production" : undefined;
        });
        expect(service.isDevelopment).toBe(false);
        expect(service.isProduction).toBe(true);
        expect(service.isTest).toBe(false);
      });

      it("isTest should return true when NODE_ENV is test", () => {
        jest.spyOn(configService, "get").mockImplementation((key: string) => {
          return key === "NODE_ENV" ? "test" : undefined;
        });
        expect(service.isDevelopment).toBe(false);
        expect(service.isProduction).toBe(false);
        expect(service.isTest).toBe(true);
      });
    });
  });

  describe("ankiConnect configuration (IAnkiConfig implementation)", () => {
    it("should return default ankiConnectUrl when ANKI_CONNECT_URL not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "ANKI_CONNECT_URL" ? defaultValue : undefined;
        });
      expect(service.ankiConnectUrl).toBe("http://localhost:8765");
    });

    it("should return ANKI_CONNECT_URL value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "ANKI_CONNECT_URL"
          ? "http://anki.example.com:8765"
          : undefined;
      });
      expect(service.ankiConnectUrl).toBe("http://anki.example.com:8765");
    });

    it("should return default ankiConnectApiVersion when ANKI_CONNECT_API_VERSION not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "ANKI_CONNECT_API_VERSION" ? defaultValue : undefined;
        });
      expect(service.ankiConnectApiVersion).toBe(6);
    });

    it("should parse ANKI_CONNECT_API_VERSION as integer", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "ANKI_CONNECT_API_VERSION" ? "7" : undefined;
      });
      expect(service.ankiConnectApiVersion).toBe(7);
    });

    it("should return undefined ankiConnectApiKey when ANKI_CONNECT_API_KEY not set", () => {
      jest.spyOn(configService, "get").mockImplementation(() => undefined);
      expect(service.ankiConnectApiKey).toBeUndefined();
    });

    it("should return ANKI_CONNECT_API_KEY value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "ANKI_CONNECT_API_KEY" ? "test-key" : undefined;
      });
      expect(service.ankiConnectApiKey).toBe("test-key");
    });

    it("should return default ankiConnectTimeout when ANKI_CONNECT_TIMEOUT not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "ANKI_CONNECT_TIMEOUT" ? defaultValue : undefined;
        });
      expect(service.ankiConnectTimeout).toBe(5000);
    });

    it("should parse ANKI_CONNECT_TIMEOUT as integer", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "ANKI_CONNECT_TIMEOUT" ? "10000" : undefined;
      });
      expect(service.ankiConnectTimeout).toBe(10000);
    });
  });

  describe("auth configuration", () => {
    it("should return default authUrl when TUNNEL_AUTH_URL not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "TUNNEL_AUTH_URL" ? defaultValue : undefined;
        });
      expect(service.authUrl).toBe("https://keycloak.anatoly.dev");
    });

    it("should return TUNNEL_AUTH_URL value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "TUNNEL_AUTH_URL"
          ? "https://auth.example.com"
          : undefined;
      });
      expect(service.authUrl).toBe("https://auth.example.com");
    });

    it("should return default authRealm when TUNNEL_AUTH_REALM not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "TUNNEL_AUTH_REALM" ? defaultValue : undefined;
        });
      expect(service.authRealm).toBe("ankimcp-dev");
    });

    it("should return TUNNEL_AUTH_REALM value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "TUNNEL_AUTH_REALM" ? "test-realm" : undefined;
      });
      expect(service.authRealm).toBe("test-realm");
    });

    it("should return default authClientId when TUNNEL_AUTH_CLIENT_ID not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "TUNNEL_AUTH_CLIENT_ID" ? defaultValue : undefined;
        });
      expect(service.authClientId).toBe("ankimcp-cli");
    });

    it("should return TUNNEL_AUTH_CLIENT_ID value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "TUNNEL_AUTH_CLIENT_ID" ? "test-client" : undefined;
      });
      expect(service.authClientId).toBe("test-client");
    });
  });

  describe("tunnel configuration", () => {
    it("should return default tunnelServerUrl when TUNNEL_SERVER_URL not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "TUNNEL_SERVER_URL" ? defaultValue : undefined;
        });
      expect(service.tunnelServerUrl).toBe("wss://tunnel.ankimcp.ai");
    });

    it("should return TUNNEL_SERVER_URL value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "TUNNEL_SERVER_URL"
          ? "wss://tunnel.example.com"
          : undefined;
      });
      expect(service.tunnelServerUrl).toBe("wss://tunnel.example.com");
    });
  });

  describe("logging configuration", () => {
    it("should return default logLevel when LOG_LEVEL not set", () => {
      jest
        .spyOn(configService, "get")
        .mockImplementation((key: string, defaultValue?: any) => {
          return key === "LOG_LEVEL" ? defaultValue : undefined;
        });
      expect(service.logLevel).toBe("info");
    });

    it("should return LOG_LEVEL value", () => {
      jest.spyOn(configService, "get").mockImplementation((key: string) => {
        return key === "LOG_LEVEL" ? "debug" : undefined;
      });
      expect(service.logLevel).toBe("debug");
    });
  });
});
