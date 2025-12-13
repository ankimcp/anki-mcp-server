import { transformEnvToConfig, configSchema, AppConfig } from "./config.schema";

/**
 * Raw config input type (all strings, before validation)
 */
export type ConfigInput = Record<string, string | undefined>;

/**
 * CLI argument overrides that can be passed to buildConfigInput
 */
export interface CliOverrides {
  port?: number;
  host?: string;
  ankiConnect?: string;
  tunnel?: string | boolean;
  ngrok?: boolean;
  debug?: boolean;
}

/**
 * Merge CLI overrides with process.env
 *
 * CLI arguments override environment variables in memory.
 * Does NOT mutate process.env - returns merged config input.
 * Env var names are defined ONLY in transformEnvToConfig().
 *
 * @param cliOverrides - Optional CLI argument overrides
 * @returns Raw config input for ConfigModule
 */
export function buildConfigInput(cliOverrides: CliOverrides = {}): ConfigInput {
  // Start with process.env, CLI overrides win
  const input: ConfigInput = { ...process.env };

  if (cliOverrides.port !== undefined) {
    input.PORT = String(cliOverrides.port);
  }
  if (cliOverrides.host !== undefined) {
    input.HOST = cliOverrides.host;
  }
  if (cliOverrides.ankiConnect !== undefined) {
    input.ANKI_CONNECT_URL = cliOverrides.ankiConnect;
  }
  if (typeof cliOverrides.tunnel === "string") {
    input.TUNNEL_SERVER_URL = cliOverrides.tunnel;
  }
  if (cliOverrides.debug) {
    input.LOG_LEVEL = "debug";
  }

  return input;
}

/**
 * Build and validate config in one step.
 * Use this when you need validated config outside NestJS DI.
 */
export function loadValidatedConfig(
  cliOverrides: CliOverrides = {},
): AppConfig {
  const input = buildConfigInput(cliOverrides);
  return configSchema.parse(transformEnvToConfig(input));
}
