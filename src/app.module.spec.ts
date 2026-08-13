import { Test, TestingModule } from "@nestjs/testing";
import { MCP_STRATEGY } from "@rekog/mcp-nest";
import { AppModule } from "./app.module";
import { AppConfigService } from "./app-config.service";
import { createMcpStrategy } from "./bootstrap";
import { createMcpHttpServer } from "./http/mcp-http.factory";
import { buildConfigInput, loadValidatedConfig } from "./config";
import { getVersion } from "./version";

/** Server identity from the same config path the entry points use. */
const serverIdentity = () => loadValidatedConfig().mcpServer;
const stdioStrategy = () => createMcpStrategy([], serverIdentity());
const httpServer = () => createMcpHttpServer(serverIdentity());

describe("AppModule", () => {
  describe("forStdio", () => {
    let module: TestingModule;

    beforeEach(async () => {
      const configInput = buildConfigInput();
      module = await Test.createTestingModule({
        imports: [AppModule.forStdio(stdioStrategy(), configInput)],
      }).compile();
    });

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should create module with STDIO transport", () => {
      expect(module).toBeDefined();
    });

    it("should provide AppConfigService", () => {
      const appConfigService = module.get<AppConfigService>(AppConfigService);
      expect(appConfigService).toBeDefined();
      expect(appConfigService).toBeInstanceOf(AppConfigService);
    });

    it("should return a DynamicModule with an imports array", () => {
      const configInput = buildConfigInput();
      const dynamicModule = AppModule.forStdio(stdioStrategy(), configInput);

      expect(dynamicModule.module).toBe(AppModule);
      expect(dynamicModule.imports).toBeDefined();
      expect(Array.isArray(dynamicModule.imports)).toBe(true);
    });

    it("should include ConfigModule", async () => {
      // ConfigModule is global, so it should be available
      expect(module).toBeDefined();
    });

    it("should include MCP primitives modules", () => {
      const dynamicModule = AppModule.forStdio(
        stdioStrategy(),
        buildConfigInput(),
      );

      // Should have 3 imports: ConfigModule, Essential, GUI
      expect(dynamicModule.imports?.length).toBe(3);
    });

    it("should register providers", () => {
      const dynamicModule = AppModule.forStdio(
        stdioStrategy(),
        buildConfigInput(),
      );

      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.providers).toContain(AppConfigService);
    });

    it("should provide the strategy it was given under MCP_STRATEGY", () => {
      const mcp = stdioStrategy();
      const dynamicModule = AppModule.forStdio(mcp, buildConfigInput());

      expect(dynamicModule.providers).toContainEqual({
        provide: MCP_STRATEGY,
        useValue: mcp,
      });
    });
  });

  describe("forHttp", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [AppModule.forHttp(httpServer(), buildConfigInput())],
      }).compile();
    });

    afterEach(async () => {
      if (module) {
        await module.close();
      }
    });

    it("should create module with HTTP transport", () => {
      expect(module).toBeDefined();
    });

    it("should provide AppConfigService", () => {
      const appConfigService = module.get<AppConfigService>(AppConfigService);
      expect(appConfigService).toBeDefined();
      expect(appConfigService).toBeInstanceOf(AppConfigService);
    });

    it("should return a DynamicModule with an imports array", () => {
      const dynamicModule = AppModule.forHttp(httpServer(), buildConfigInput());

      expect(dynamicModule.module).toBe(AppModule);
      expect(dynamicModule.imports).toBeDefined();
      expect(Array.isArray(dynamicModule.imports)).toBe(true);
    });

    it("should include ConfigModule", async () => {
      // ConfigModule is global, so it should be available
      expect(module).toBeDefined();
    });

    it("should include MCP primitives modules", () => {
      const dynamicModule = AppModule.forHttp(httpServer(), buildConfigInput());

      // Should have 3 imports: ConfigModule, Essential, GUI
      expect(dynamicModule.imports?.length).toBe(3);
    });

    it("should register providers", () => {
      const dynamicModule = AppModule.forHttp(httpServer(), buildConfigInput());

      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.providers).toContain(AppConfigService);
    });

    it("should register the MCP endpoint as a controller it owns", () => {
      // Owning the route (instead of letting the transport self-mount) is what
      // puts the DNS-rebinding guards in front of every MCP request.
      const mcpHttp = httpServer();
      const dynamicModule = AppModule.forHttp(mcpHttp, buildConfigInput());

      expect(dynamicModule.controllers).toEqual([mcpHttp.controller]);
    });

    it("should provide the strategy it was given under MCP_STRATEGY", () => {
      const mcpHttp = httpServer();
      const dynamicModule = AppModule.forHttp(mcpHttp, buildConfigInput());

      expect(dynamicModule.providers).toContainEqual({
        provide: MCP_STRATEGY,
        useValue: mcpHttp.strategy,
      });
    });
  });

  describe("forTunnel", () => {
    it("should provide the strategy it was given under MCP_STRATEGY", () => {
      const mcp = stdioStrategy();
      const dynamicModule = AppModule.forTunnel(mcp, {});

      expect(dynamicModule.module).toBe(AppModule);
      expect(dynamicModule.providers).toContainEqual({
        provide: MCP_STRATEGY,
        useValue: mcp,
      });
    });
  });

  describe("forStdio vs forHttp", () => {
    it("should create different configurations for STDIO and HTTP", () => {
      const stdioModule = AppModule.forStdio(
        stdioStrategy(),
        buildConfigInput(),
      );
      const httpModule = AppModule.forHttp(httpServer(), buildConfigInput());

      expect(stdioModule).toBeDefined();
      expect(httpModule).toBeDefined();

      // Both should have the same module class
      expect(stdioModule.module).toBe(httpModule.module);

      // Both should have the same number of imports
      expect(stdioModule.imports?.length).toBe(httpModule.imports?.length);

      // Both should provide AppConfigService
      expect(stdioModule.providers).toContain(AppConfigService);
      expect(httpModule.providers).toContain(AppConfigService);
    });

    it("should both include essential primitives", () => {
      const stdioModule = AppModule.forStdio(
        stdioStrategy(),
        buildConfigInput(),
      );
      const httpModule = AppModule.forHttp(httpServer(), buildConfigInput());

      // Both configurations should import the same primitives
      expect(stdioModule.imports?.length).toBe(3);
      expect(httpModule.imports?.length).toBe(3);
    });

    it("should both include GUI primitives", () => {
      const stdioModule = AppModule.forStdio(
        stdioStrategy(),
        buildConfigInput(),
      );
      const httpModule = AppModule.forHttp(httpServer(), buildConfigInput());

      // Both should have 3 imports (Config, Essential, GUI)
      expect(stdioModule.imports?.length).toBe(3);
      expect(httpModule.imports?.length).toBe(3);
    });
  });

  describe("MCP server identity", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use MCP_SERVER_NAME from config", () => {
      process.env.MCP_SERVER_NAME = "test-server";

      expect(stdioStrategy().options.name).toBe("test-server");
    });

    it("should use MCP_SERVER_VERSION from config", () => {
      process.env.MCP_SERVER_VERSION = "2.0.0";

      expect(stdioStrategy().options.version).toBe("2.0.0");
    });

    it("should fall back to default server name when not in environment", () => {
      delete process.env.MCP_SERVER_NAME;

      expect(stdioStrategy().options.name).toBe("anki-mcp-server");
    });

    it("should fall back to the package version when not in environment", () => {
      delete process.env.MCP_SERVER_VERSION;

      expect(stdioStrategy().options.version).toBe(getVersion());
    });

    it("should advertise the same identity in HTTP mode", () => {
      // Every mode builds its strategy through createMcpStrategy, so serverInfo
      // cannot drift between transports.
      const mcpHttp = httpServer();

      expect(mcpHttp.strategy.options.name).toBe("anki-mcp-server");
      expect(mcpHttp.strategy.options.version).toBe(getVersion());
    });
  });

  describe("regression tests", () => {
    it("should maintain backward compatibility for STDIO mode", async () => {
      // This ensures existing STDIO functionality still works
      const module = await Test.createTestingModule({
        imports: [AppModule.forStdio(stdioStrategy(), buildConfigInput())],
      }).compile();

      expect(module).toBeDefined();

      const ankiConfigService = module.get<AppConfigService>(AppConfigService);
      expect(ankiConfigService).toBeDefined();

      await module.close();
    });

    it("should not break existing module structure", () => {
      const stdioModule = AppModule.forStdio(
        stdioStrategy(),
        buildConfigInput(),
      );
      const httpModule = AppModule.forHttp(httpServer(), buildConfigInput());

      // Ensure both configurations have the expected structure
      expect(stdioModule.module).toBeDefined();
      expect(stdioModule.imports).toBeDefined();
      expect(stdioModule.providers).toBeDefined();

      expect(httpModule.module).toBeDefined();
      expect(httpModule.imports).toBeDefined();
      expect(httpModule.providers).toBeDefined();
    });
  });
});
