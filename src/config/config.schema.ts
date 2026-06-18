import { z } from "zod";

/**
 * Zod schema for application configuration
 * Maps environment variables to a strongly-typed config object
 */
/**
 * Default Origin patterns accepted when ALLOWED_ORIGINS is not set.
 * Loopback-only; wildcards match any port. Previously hardcoded in the
 * OriginValidationGuard, now sourced through config so it can be overridden.
 */
export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:*",
  "http://127.0.0.1:*",
  "https://localhost:*",
  "https://127.0.0.1:*",
];

/**
 * Splits a comma-separated env string into a trimmed, non-empty list.
 * Returns the schema default ([]) when the value is absent or blank.
 */
function parseCsvList(val: unknown): string[] | undefined {
  if (val === undefined || val === null) return undefined;
  if (Array.isArray(val)) return val;
  if (typeof val !== "string") return undefined;
  const items = val
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items;
}

export const configSchema = z.object({
  // Server
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default("127.0.0.1"),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // DNS-rebinding protection (HTTP transport)
  // Extra Host headers to accept beyond the built-in loopback set
  // (localhost, 127.0.0.1, ::1). Hostname-only; ports are ignored.
  allowedHosts: z.preprocess(parseCsvList, z.array(z.string())).default([]),
  // Origin/Referer allowlist for the OriginValidationGuard.
  allowedOrigins: z
    .preprocess(parseCsvList, z.array(z.string()))
    .default(DEFAULT_ALLOWED_ORIGINS),

  // AnkiConnect
  ankiConnect: z.object({
    url: z.string().url().default("http://localhost:8765"),
    apiKey: z.string().optional(),
    apiVersion: z.coerce.number().int().positive().default(6),
    timeout: z.coerce.number().int().positive().default(5000),
  }),

  // Auth (generic, not Keycloak-specific)
  auth: z.object({
    clientId: z.string().default("ankimcp-cli"),
  }),

  // Tunnel
  tunnel: z.object({
    serverUrl: z.string().url().default("wss://tunnel.ankimcp.ai"),
  }),

  // Read-only mode
  readOnly: z
    .preprocess((val) => {
      if (val === "true" || val === "1") return true;
      if (val === "false" || val === "0" || val === undefined || val === "")
        return false;
      return val;
    }, z.boolean())
    .default(false),

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
    allowedHosts: env.ALLOWED_HOSTS,
    allowedOrigins: env.ALLOWED_ORIGINS,
    ankiConnect: {
      url: env.ANKI_CONNECT_URL,
      apiKey: env.ANKI_CONNECT_API_KEY,
      apiVersion: env.ANKI_CONNECT_API_VERSION,
      timeout: env.ANKI_CONNECT_TIMEOUT,
    },
    auth: {
      clientId: env.TUNNEL_AUTH_CLIENT_ID,
    },
    tunnel: {
      serverUrl: env.TUNNEL_SERVER_URL,
    },
    readOnly: env.READ_ONLY,
    logLevel: env.LOG_LEVEL,
  };
}
