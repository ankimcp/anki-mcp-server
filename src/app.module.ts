import { DynamicModule, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { MCP_STRATEGY, McpStrategy } from "@rekog/mcp-nest";
import { OriginValidationGuard } from "./http/guards/origin-validation.guard";
import { HostValidationGuard } from "./http/guards/host-validation.guard";
import type { McpHttpServer } from "./http/mcp-http.factory";
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
  loadValidatedConfig,
  CliOverrides,
} from "@/config";

/**
 * The capability classes themselves are registered as `controllers` by
 * `McpPrimitivesAnkiEssentialModule` / `McpPrimitivesAnkiGuiModule`. NestJS
 * scans every module's controllers for the `@MessagePattern` handlers that
 * `@Tool`/`@Prompt`/`@Resource` compile to, so the strategy sees them without
 * AppModule re-listing them.
 */
@Module({})
export class AppModule {
  /**
   * Creates AppModule configured for STDIO transport
   * @param mcp - MCP strategy the bootstrap connects as a microservice
   * @param configInput - Raw config input (merged env + CLI overrides)
   */
  static forStdio(mcp: McpStrategy, configInput: ConfigInput): DynamicModule {
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
        {
          provide: APP_CONFIG,
          useValue: validatedConfig,
        },
        {
          provide: MCP_STRATEGY,
          useValue: mcp,
        },
        AppConfigService,
      ],
      exports: [APP_CONFIG, AppConfigService],
    };
  }

  /**
   * Creates AppModule configured for HTTP (Streamable HTTP) transport
   * @param mcpHttp - Strategy + the controller that owns the `/` MCP route
   * @param configInput - Raw config input (merged env + CLI overrides)
   */
  static forHttp(
    mcpHttp: McpHttpServer,
    configInput: ConfigInput,
  ): DynamicModule {
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
      // The MCP endpoint is a controller we own rather than a route the
      // transport self-mounts, so it goes through the Nest pipeline and the
      // APP_GUARD guards below apply to it.
      controllers: [mcpHttp.controller],
      providers: [
        {
          provide: APP_CONFIG,
          useValue: validatedConfig,
        },
        {
          provide: MCP_STRATEGY,
          useValue: mcpHttp.strategy,
        },
        AppConfigService,
        // DNS-rebinding protection (HTTP transport only). Registered at module
        // level so the guards run for every request and can use DI for config.
        {
          provide: APP_GUARD,
          useClass: OriginValidationGuard,
        },
        {
          provide: APP_GUARD,
          useClass: HostValidationGuard,
        },
      ],
      exports: [APP_CONFIG, AppConfigService],
    };
  }

  /**
   * Creates AppModule configured for Tunnel transport
   * @param mcp - MCP strategy carrying the tunnel transport
   * @param cliOverrides - Optional CLI argument overrides
   */
  static forTunnel(
    mcp: McpStrategy,
    cliOverrides?: CliOverrides,
  ): DynamicModule {
    // Use loadValidatedConfig to parse CLI overrides + env
    const validatedConfig = loadValidatedConfig(cliOverrides);

    return {
      module: AppModule,
      imports: [
        // Configuration Module (uses same validated config)
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          load: [() => validatedConfig],
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
        {
          provide: MCP_STRATEGY,
          useValue: mcp,
        },
        AppConfigService,
      ],
      exports: [APP_CONFIG, AppConfigService],
    };
  }
}
