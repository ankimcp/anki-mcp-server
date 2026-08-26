import { z } from "zod";
import { getVersion } from "@/version";

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
 * Treats a blank/whitespace-only string as "not set" so it falls through to
 * the schema default instead of failing coercion (PORT="") or binding an
 * unintended value (HOST=""). Non-string values pass through unchanged.
 */
function emptyStringToUndefined(val: unknown): unknown {
  if (typeof val === "string" && val.trim() === "") return undefined;
  return val;
}

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
  // `.default()` must sit on the *inner* schema, not chained after
  // `.preprocess()` — Zod 4 only re-applies `.default()` when the value
  // reaching it is `undefined` before preprocessing runs, so chaining it
  // outside would leave PORT="" / HOST="" as validation failures instead of
  // falling back to the default.
  port: z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().positive().default(3000),
  ),
  host: z.preprocess(emptyStringToUndefined, z.string().default("127.0.0.1")),
  nodeEnv: z.enum(["development", "production", "test"]).default("development"),

  // MCP server identity, advertised as `serverInfo` on every transport.
  // `prefault` (not `default`) so an absent object still gets the inner
  // defaults — Zod 4 returns a `default` value without re-parsing it.
  mcpServer: z
    .object({
      name: z.string().default("anki-mcp-server"),
      version: z.string().default(() => getVersion()),
    })
    .prefault({}),

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
    mcpServer: {
      name: env.MCP_SERVER_NAME,
      version: env.MCP_SERVER_VERSION,
    },
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
