import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IAnkiConfig } from "./mcp/config/anki-config.interface";
import { sanitizeMcpbConfigValue } from "./mcp/utils/mcpb-workarounds";

/**
 * Configuration service implementing IAnkiConfig for the STDIO MCP server
 */
@Injectable()
export class AnkiConfigService implements IAnkiConfig {
  constructor(private configService: ConfigService) {}

  get ankiConnectUrl(): string {
    return this.configService.get<string>(
      "ANKI_CONNECT_URL",
      "http://localhost:8765",
    );
  }

  get ankiConnectApiVersion(): number {
    const version = this.configService.get<string>(
      "ANKI_CONNECT_API_VERSION",
      "6",
    );
    return parseInt(version, 10);
  }

  get ankiConnectApiKey(): string | undefined {
    const apiKey = this.configService.get<string>("ANKI_CONNECT_API_KEY");
    return sanitizeMcpbConfigValue(apiKey);
  }

  get ankiConnectTimeout(): number {
    const timeout = this.configService.get<string>(
      "ANKI_CONNECT_TIMEOUT",
      "5000",
    );
    return parseInt(timeout, 10);
  }

  get readOnly(): boolean {
    const readOnly = this.configService.get<string>("READ_ONLY", "false");
    return readOnly === "true" || readOnly === "1";
  }
}
