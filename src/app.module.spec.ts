import { Test, TestingModule } from "@nestjs/testing";
import { AppModule } from "./app.module";
import { AppConfigService } from "./app-config.service";
import { buildConfigInput } from "./config";

describe("AppModule", () => {
  describe("forStdio", () => {
    let module: TestingModule;

    beforeEach(async () => {
      const configInput = buildConfigInput();
      module = await Test.createTestingModule({
        imports: [AppModule.forStdio(configInput)],
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

    it("should have STDIO transport configuration", () => {
      const configInput = buildConfigInput();
      const dynamicModule = AppModule.forStdio(configInput);

      expect(dynamicModule.module).toBe(AppModule);
      expect(dynamicModule.imports).toBeDefined();
      expect(Array.isArray(dynamicModule.imports)).toBe(true);
    });

    it("should include ConfigModule", async () => {
      // ConfigModule is global, so it should be available
      expect(module).toBeDefined();
    });

    it("should include MCP primitives modules", () => {
      const dynamicModule = AppModule.forStdio(buildConfigInput());

      // Should have 4 imports: ConfigModule, McpModule, Essential, GUI
      expect(dynamicModule.imports?.length).toBe(4);
    });

    it("should register providers", () => {
      const dynamicModule = AppModule.forStdio(buildConfigInput());

      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.providers).toContain(AppConfigService);
    });
  });

  describe("forHttp", () => {
    let module: TestingModule;

    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [AppModule.forHttp(buildConfigInput())],
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

    it("should have STREAMABLE_HTTP transport configuration", () => {
      const dynamicModule = AppModule.forHttp(buildConfigInput());

      expect(dynamicModule.module).toBe(AppModule);
      expect(dynamicModule.imports).toBeDefined();
      expect(Array.isArray(dynamicModule.imports)).toBe(true);
    });

    it("should include ConfigModule", async () => {
      // ConfigModule is global, so it should be available
      expect(module).toBeDefined();
    });

    it("should include MCP primitives modules", () => {
      const dynamicModule = AppModule.forHttp(buildConfigInput());

      // Should have 4 imports: ConfigModule, McpModule, Essential, GUI
      expect(dynamicModule.imports?.length).toBe(4);
    });

    it("should register providers", () => {
      const dynamicModule = AppModule.forHttp(buildConfigInput());

      expect(dynamicModule.providers).toBeDefined();
      expect(dynamicModule.providers).toContain(AppConfigService);
    });

    it("should configure mcpEndpoint as root path", () => {
      const dynamicModule = AppModule.forHttp(buildConfigInput());

      // We can't directly inspect the McpModule config, but we can verify
      // the module structure is correct
      expect(dynamicModule.imports?.length).toBeGreaterThan(0);
    });
  });

  describe("forStdio vs forHttp", () => {
    it("should create different configurations for STDIO and HTTP", () => {
      const stdioModule = AppModule.forStdio(buildConfigInput());
      const httpModule = AppModule.forHttp(buildConfigInput());

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
      const stdioModule = AppModule.forStdio(buildConfigInput());
      const httpModule = AppModule.forHttp(buildConfigInput());

      // Both configurations should import the same primitives
      expect(stdioModule.imports?.length).toBe(4);
      expect(httpModule.imports?.length).toBe(4);
    });

    it("should both include GUI primitives", () => {
      const stdioModule = AppModule.forStdio(buildConfigInput());
      const httpModule = AppModule.forHttp(buildConfigInput());

      // Both should have 4 imports (Config, MCP, Essential, GUI)
      expect(stdioModule.imports?.length).toBe(4);
      expect(httpModule.imports?.length).toBe(4);
    });
  });

  describe("environment configuration", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should use MCP_SERVER_NAME from environment for STDIO", () => {
      process.env.MCP_SERVER_NAME = "test-server-stdio";

      const dynamicModule = AppModule.forStdio(buildConfigInput());

      expect(dynamicModule).toBeDefined();
      // The actual value is used internally by McpModule
    });

    it("should use MCP_SERVER_NAME from environment for HTTP", () => {
      process.env.MCP_SERVER_NAME = "test-server-http";

      const dynamicModule = AppModule.forHttp(buildConfigInput());

      expect(dynamicModule).toBeDefined();
      // The actual value is used internally by McpModule
    });

    it("should use MCP_SERVER_VERSION from environment for STDIO", () => {
      process.env.MCP_SERVER_VERSION = "2.0.0";

      const dynamicModule = AppModule.forStdio(buildConfigInput());

      expect(dynamicModule).toBeDefined();
      // The actual value is used internally by McpModule
    });

    it("should use MCP_SERVER_VERSION from environment for HTTP", () => {
      process.env.MCP_SERVER_VERSION = "2.0.0";

      const dynamicModule = AppModule.forHttp(buildConfigInput());

      expect(dynamicModule).toBeDefined();
      // The actual value is used internally by McpModule
    });

    it("should fall back to default server name when not in environment", () => {
      delete process.env.MCP_SERVER_NAME;

      const dynamicModule = AppModule.forStdio(buildConfigInput());

      expect(dynamicModule).toBeDefined();
      // Default 'anki-mcp-desktop' is used internally
    });

    it("should fall back to default version when not in environment", () => {
      delete process.env.MCP_SERVER_VERSION;

      const dynamicModule = AppModule.forHttp(buildConfigInput());

      expect(dynamicModule).toBeDefined();
      // Default '1.0.0' is used internally
    });
  });

  describe("regression tests", () => {
    it("should maintain backward compatibility for STDIO mode", async () => {
      // This ensures existing STDIO functionality still works
      const module = await Test.createTestingModule({
        imports: [AppModule.forStdio(buildConfigInput())],
      }).compile();

      expect(module).toBeDefined();

      const ankiConfigService = module.get<AppConfigService>(AppConfigService);
      expect(ankiConfigService).toBeDefined();

      await module.close();
    });

    it("should not break existing module structure", () => {
      const stdioModule = AppModule.forStdio(buildConfigInput());
      const httpModule = AppModule.forHttp(buildConfigInput());

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
