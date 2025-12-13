import { transformEnvToConfig, configSchema, AppConfig } from './config.schema';

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
 * SINGLE SOURCE OF TRUTH for reading process.env
 *
 * This is the ONLY place in the codebase that should read process.env.*
 * CLI arguments override environment variables in memory.
 * Does NOT mutate process.env - returns merged config input.
 *
 * @param cliOverrides - Optional CLI argument overrides
 * @returns Raw config input for ConfigModule
 */
export function buildConfigInput(cliOverrides: CliOverrides = {}): ConfigInput {
  // Read ALL environment variables HERE and only here
  const input: ConfigInput = {
    PORT: process.env.PORT,
    HOST: process.env.HOST,
    NODE_ENV: process.env.NODE_ENV,
    ANKI_CONNECT_URL: process.env.ANKI_CONNECT_URL,
    ANKI_CONNECT_API_KEY: process.env.ANKI_CONNECT_API_KEY,
    ANKI_CONNECT_API_VERSION: process.env.ANKI_CONNECT_API_VERSION,
    ANKI_CONNECT_TIMEOUT: process.env.ANKI_CONNECT_TIMEOUT,
    TUNNEL_AUTH_URL: process.env.TUNNEL_AUTH_URL,
    TUNNEL_AUTH_REALM: process.env.TUNNEL_AUTH_REALM,
    TUNNEL_AUTH_CLIENT_ID: process.env.TUNNEL_AUTH_CLIENT_ID,
    TUNNEL_SERVER_URL: process.env.TUNNEL_SERVER_URL,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };

  // CLI overrides win over environment variables (in memory, no mutation)
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
  // CLI override for debug mode
  if (cliOverrides.debug) {
    input.LOG_LEVEL = 'debug';
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
