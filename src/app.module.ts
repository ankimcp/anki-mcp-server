import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { McpModule, McpTransportType } from "@rekog/mcp-nest";
import {
  McpPrimitivesAnkiEssentialModule,
  ANKI_CONFIG,
} from "./mcp/primitives/essential";
import { McpPrimitivesAnkiGuiModule } from "./mcp/primitives/gui";
import { AppConfigService } from "./app-config.service";
import {
  configSchema,
  transformEnvToConfig,
  ConfigInput,
  APP_CONFIG,
} from "@/config";

@Module({})
export class AppModule {
  /**
   * Creates AppModule configured for STDIO transport
   * @param configInput - Raw config input (merged env + CLI overrides)
   */
  static forStdio(configInput: ConfigInput): DynamicModule {
    // Parse config once, use everywhere (single source of truth)
    const validatedConfig = configSchema.parse(
      transformEnvToConfig(configInput),
    );

    return {
      module: AppModule,
      imports: [
        // Configuration Module (uses same validated config)
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          load: [() => validatedConfig],
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
          appConfigProvider: {
            provide: APP_CONFIG,
            useValue: validatedConfig,
          },
        }),

        // Import GUI primitives with config
        McpPrimitivesAnkiGuiModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AppConfigService,
          },
          appConfigProvider: {
            provide: APP_CONFIG,
            useValue: validatedConfig,
          },
        }),
      ],
      providers: [
        // Provide validated config for type-safe injection
        {
          provide: APP_CONFIG,
          useValue: validatedConfig,
        },
        AppConfigService,
      ],
      exports: [APP_CONFIG, AppConfigService],
    };
  }

  /**
   * Creates AppModule configured for HTTP (Streamable HTTP) transport
   * @param configInput - Raw config input (merged env + CLI overrides)
   */
  static forHttp(configInput: ConfigInput): DynamicModule {
    // Parse config once, use everywhere (single source of truth)
    const validatedConfig = configSchema.parse(
      transformEnvToConfig(configInput),
    );

    return {
      module: AppModule,
      imports: [
        // Configuration Module (uses same validated config)
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          load: [() => validatedConfig],
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
          appConfigProvider: {
            provide: APP_CONFIG,
            useValue: validatedConfig,
          },
        }),

        // Import GUI primitives with config
        McpPrimitivesAnkiGuiModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AppConfigService,
          },
          appConfigProvider: {
            provide: APP_CONFIG,
            useValue: validatedConfig,
          },
        }),
      ],
      providers: [
        // Provide validated config for type-safe injection
        {
          provide: APP_CONFIG,
          useValue: validatedConfig,
        },
        AppConfigService,
      ],
      exports: [APP_CONFIG, AppConfigService],
    };
  }
}
