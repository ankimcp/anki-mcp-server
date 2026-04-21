import { DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { McpModule, McpTransportType } from "@rekog/mcp-nest";
import {
  McpPrimitivesAnkiEssentialModule,
  ANKI_CONFIG,
  ESSENTIAL_MCP_TOOLS,
} from "./mcp/primitives/essential";
import {
  McpPrimitivesAnkiGuiModule,
  GUI_MCP_TOOLS,
} from "./mcp/primitives/gui";
import { AnkiConfigService } from "./anki-config.service";
import { MCP_ICONS } from "./mcp/mcp-icons";
import { FaviconController } from "./http/controllers/favicon.controller";

@Module({})
export class AppModule {
  /**
   * Creates AppModule configured for STDIO transport
   */
  static forStdio(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Configuration Module
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          envFilePath: [".env.local", ".env"],
        }),

        // MCP Module with STDIO transport
        McpModule.forRoot({
          name: process.env.MCP_SERVER_NAME || "anki-mcp-server",
          version: process.env.MCP_SERVER_VERSION || "1.0.0",
          transport: McpTransportType.STDIO,
          icons: MCP_ICONS,
        }),

        // Import MCP primitives with config
        McpPrimitivesAnkiEssentialModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AnkiConfigService,
          },
        }),

        // Import GUI primitives with config
        McpPrimitivesAnkiGuiModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AnkiConfigService,
          },
        }),
      ],
      // MCP-Nest 1.9.0+ requires tools to be explicitly listed in the module where McpModule.forRoot() is configured.
      providers: [AnkiConfigService, ...ESSENTIAL_MCP_TOOLS, ...GUI_MCP_TOOLS],
    };
  }

  /**
   * Creates AppModule configured for HTTP (Streamable HTTP) transport
   */
  static forHttp(): DynamicModule {
    return {
      module: AppModule,
      imports: [
        // Configuration Module
        ConfigModule.forRoot({
          isGlobal: true,
          cache: true,
          envFilePath: [".env.local", ".env"],
        }),

        // MCP Module with Streamable HTTP transport
        McpModule.forRoot({
          name: process.env.MCP_SERVER_NAME || "anki-mcp-server",
          version: process.env.MCP_SERVER_VERSION || "1.0.0",
          transport: McpTransportType.STREAMABLE_HTTP,
          mcpEndpoint: "/",
          icons: MCP_ICONS,
        }),

        // Import MCP primitives with config
        McpPrimitivesAnkiEssentialModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AnkiConfigService,
          },
        }),

        // Import GUI primitives with config
        McpPrimitivesAnkiGuiModule.forRoot({
          ankiConfigProvider: {
            provide: ANKI_CONFIG,
            useClass: AnkiConfigService,
          },
        }),
      ],
      // HTTP-only: serve browser favicons at the site root.
      controllers: [FaviconController],
      // MCP-Nest 1.9.0+ requires tools to be explicitly listed in the module where McpModule.forRoot() is configured.
      providers: [AnkiConfigService, ...ESSENTIAL_MCP_TOOLS, ...GUI_MCP_TOOLS],
    };
  }
}
