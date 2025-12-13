import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IAnkiConfig } from "./mcp/config/anki-config.interface";
import { sanitizeMcpbConfigValue } from "./mcp/utils/mcpb-workarounds";

/**
 * Application configuration service that provides type-safe access to all config values
 * Extends the original AnkiConfigService to support server, auth, tunnel, and logging config
 */
@Injectable()
export class AppConfigService implements IAnkiConfig {
  constructor(private configService: ConfigService) {}

  // ===== Server Configuration =====

  get port(): number {
    return this.configService.get<number>("PORT", 3000);
  }

  get host(): string {
    return this.configService.get<string>("HOST", "127.0.0.1");
  }

  get nodeEnv(): "development" | "production" | "test" {
    return this.configService.get<"development" | "production" | "test">(
      "NODE_ENV",
      "development",
    );
  }

  get isDevelopment(): boolean {
    return this.nodeEnv === "development";
  }

  get isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  get isTest(): boolean {
    return this.nodeEnv === "test";
  }

  // ===== AnkiConnect Configuration (IAnkiConfig implementation) =====

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

  // ===== Auth Configuration =====

  get authUrl(): string {
    return this.configService.get<string>(
      "TUNNEL_AUTH_URL",
      "https://keycloak.anatoly.dev",
    );
  }

  get authRealm(): string {
    return this.configService.get<string>("TUNNEL_AUTH_REALM", "ankimcp-dev");
  }

  get authClientId(): string {
    return this.configService.get<string>(
      "TUNNEL_AUTH_CLIENT_ID",
      "ankimcp-cli",
    );
  }

  // ===== Tunnel Configuration =====

  get tunnelServerUrl(): string {
    return this.configService.get<string>(
      "TUNNEL_SERVER_URL",
      "wss://tunnel.ankimcp.ai",
    );
  }

  // ===== Logging Configuration =====

  get logLevel(): "debug" | "info" | "warn" | "error" {
    return this.configService.get<"debug" | "info" | "warn" | "error">(
      "LOG_LEVEL",
      "info",
    );
  }
}
