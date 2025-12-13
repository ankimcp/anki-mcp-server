import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { McpModule, McpTransportType } from "@rekog/mcp-nest";
import {
  McpPrimitivesAnkiEssentialModule,
  ANKI_CONFIG,
} from "./mcp/primitives/essential";
import { McpPrimitivesAnkiGuiModule } from "./mcp/primitives/gui";
import { AppConfigService } from "./app-config.service";
import { configSchema, transformEnvToConfig, ConfigInput } from "@/config";

@Module({})
export class AppModule {
  /**
   * Creates AppModule configured for STDIO transport
   * @param configInput - Raw config input (merged env + CLI overrides)
   */
  static forStdio(configInput: ConfigInput): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Configuration Module with Zod validation
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          load: [() => configSchema.parse(transformEnvToConfig(configInput))],
        }),

        // MCP Module with STDIO transport
        McpModule.forRoot({
          name: process.env.MCP_SERVER_NAME || "anki-mcp-server",
          version: process.env.MCP_SERVER_VERSION || "1.0.0",
          transport: McpTransportType.STDIO,
        }),

        // Import MCP primitives with config
        McpPrimitivesAnkiEssentialModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AppConfigService,
          },
        }),

        // Import GUI primitives with config
        McpPrimitivesAnkiGuiModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AppConfigService,
          },
        }),
      ],
      providers: [AppConfigService],
    };
  }

  /**
   * Creates AppModule configured for HTTP (Streamable HTTP) transport
   * @param configInput - Raw config input (merged env + CLI overrides)
   */
  static forHttp(configInput: ConfigInput): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Configuration Module with Zod validation
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          load: [() => configSchema.parse(transformEnvToConfig(configInput))],
        }),

        // MCP Module with Streamable HTTP transport
        McpModule.forRoot({
          name: process.env.MCP_SERVER_NAME || "anki-mcp-server",
          version: process.env.MCP_SERVER_VERSION || "1.0.0",
          transport: McpTransportType.STREAMABLE_HTTP,
          mcpEndpoint: "/",
        }),

        // Import MCP primitives with config
        McpPrimitivesAnkiEssentialModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AppConfigService,
          },
        }),

        // Import GUI primitives with config
        McpPrimitivesAnkiGuiModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AppConfigService,
          },
        }),
      ],
      providers: [AppConfigService],
    };
  }
}
