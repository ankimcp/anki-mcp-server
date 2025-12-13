import { Inject, Injectable } from "@nestjs/common";
import { IAnkiConfig } from "./mcp/config/anki-config.interface";
import { APP_CONFIG } from "@/config";
import type { AppConfig } from "@/config";
import { sanitizeMcpbConfigValue } from "./mcp/utils/mcpb-workarounds";

/**
 * Application configuration service that provides type-safe access to all config values
 * Injects validated AppConfig for compile-time type safety (no string keys!)
 */
@Injectable()
export class AppConfigService implements IAnkiConfig {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  // ===== Server Configuration =====

  get port(): number {
    return this.config.port;
  }

  get host(): string {
    return this.config.host;
  }

  get nodeEnv(): "development" | "production" | "test" {
    return this.config.nodeEnv;
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
    return this.config.ankiConnect.url;
  }

  get ankiConnectApiVersion(): number {
    return this.config.ankiConnect.apiVersion;
  }

  get ankiConnectApiKey(): string | undefined {
    return sanitizeMcpbConfigValue(this.config.ankiConnect.apiKey);
  }

  get ankiConnectTimeout(): number {
    return this.config.ankiConnect.timeout;
  }

  // ===== Auth Configuration =====

  get authUrl(): string {
    return this.config.auth.url;
  }

  get authRealm(): string {
    return this.config.auth.realm;
  }

  get authClientId(): string {
    return this.config.auth.clientId;
  }

  // ===== Tunnel Configuration =====

  get tunnelServerUrl(): string {
    return this.config.tunnel.serverUrl;
  }

  // ===== Logging Configuration =====

  get logLevel(): "debug" | "info" | "warn" | "error" {
    return this.config.logLevel;
  }
}
