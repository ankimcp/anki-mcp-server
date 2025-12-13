import { z } from "zod";

/**
 * Zod schema for application configuration
 * Maps environment variables to a strongly-typed config object
 */
export const configSchema = z.object({
  // Server
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default("127.0.0.1"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // AnkiConnect
  ankiConnect: z.object({
    url: z.string().url().default("http://localhost:8765"),
    apiKey: z.string().optional(),
    apiVersion: z.coerce.number().int().positive().default(6),
    timeout: z.coerce.number().int().positive().default(5000),
  }),

  // Auth (generic, not Keycloak-specific)
  auth: z.object({
    url: z.string().url().default("https://keycloak.anatoly.dev"),
    realm: z.string().default("ankimcp-dev"),
    clientId: z.string().default("ankimcp-cli"),
  }),

  // Tunnel
  tunnel: z.object({
    serverUrl: z.string().url().default("wss://tunnel.ankimcp.ai"),
  }),

  // Logging
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof configSchema>;

/**
 * Transforms flat environment variables into nested config structure
 * This function maps process.env to the shape expected by configSchema
 *
 * Note: Returns any instead of AppConfig because Zod will validate and coerce
 * the values. This allows undefined values to be properly handled by Zod defaults.
 */
export function transformEnvToConfig(env: Record<string, any>): any {
  return {
    port: env.PORT,
    host: env.HOST,
    nodeEnv: env.NODE_ENV,
    ankiConnect: {
      url: env.ANKI_CONNECT_URL,
      apiKey: env.ANKI_CONNECT_API_KEY,
      apiVersion: env.ANKI_CONNECT_API_VERSION,
      timeout: env.ANKI_CONNECT_TIMEOUT,
    },
    auth: {
      url: env.TUNNEL_AUTH_URL,
      realm: env.TUNNEL_AUTH_REALM,
      clientId: env.TUNNEL_AUTH_CLIENT_ID,
    },
    tunnel: {
      serverUrl: env.TUNNEL_SERVER_URL,
    },
    logLevel: env.LOG_LEVEL,
  };
}
