import { LoggerService } from "@nestjs/common";
import { pino } from "pino";
import { McpStrategy, type McpTransport } from "@rekog/mcp-nest";
import { MCP_ICONS } from "@/mcp/mcp-icons";
import type { AppConfig } from "@/config";

/**
 * File descriptor constants for logger output destinations
 */
export const LOG_DESTINATION = {
  /** stdout (fd 1) - Use for HTTP mode where stdout is available */
  STDOUT: 1,
  /** stderr (fd 2) - Use for STDIO mode to keep stdout clear for MCP protocol */
  STDERR: 2,
} as const;

export type LogDestination =
  (typeof LOG_DESTINATION)[keyof typeof LOG_DESTINATION];

/**
 * NestJS log contexts whose `log`-level output is demoted to pino `debug`.
 *
 * mcp-nest v2 requires every capability class to be an `@McpController()`, which
 * composes `@Controller()` so `@MessagePattern` handlers get discovered. In HTTP
 * mode that makes Nest's router announce all ~50 tools/prompts/resources under
 * `RoutesResolver`, even though `@Tool`/`@Prompt`/`@Resource` add no HTTP verb
 * metadata and the classes therefore expose zero HTTP routes.
 *
 * `RouterExplorer` is deliberately absent: it only fires for routes that really
 * were mapped, so it stays at info and remains the startup record of the MCP
 * endpoint (`Mapped {/, POST} route` and friends).
 */
const DEMOTED_LOG_CONTEXTS: ReadonlySet<string> = new Set(["RoutesResolver"]);

/**
 * Creates a Pino logger configured for the specified transport mode
 *
 * @param destination - LOG_DESTINATION.STDOUT for HTTP, LOG_DESTINATION.STDERR for STDIO
 * @param logLevel - Log level (debug, info, warn, error). Defaults to 'info'
 * @returns Configured pino logger instance
 */
export function createPinoLogger(
  destination: LogDestination,
  logLevel: string = "info",
) {
  return pino({
    level: logLevel,
    transport: {
      target: "pino-pretty",
      options: {
        destination,
        colorize: true,
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  });
}

/**
 * Creates a NestJS-compatible logger service from a Pino logger
 *
 * Contexts in `DEMOTED_LOG_CONTEXTS` are routed to pino `debug` instead of
 * `info` so the noise is hidden by default but recoverable with
 * `LOG_LEVEL=debug`. Only the `log` path is remapped — warnings and errors are
 * never downgraded, whatever context they carry.
 *
 * @param pinoLogger - The pino logger instance
 * @returns NestJS LoggerService implementation
 */
export function createLoggerService(pinoLogger: any): LoggerService {
  return {
    log: (message: any, context?: string) => {
      if (context !== undefined && DEMOTED_LOG_CONTEXTS.has(context)) {
        pinoLogger.debug({ context }, message);
        return;
      }
      pinoLogger.info({ context }, message);
    },
    error: (message: any, trace?: string, context?: string) => {
      pinoLogger.error({ context, trace }, message);
    },
    warn: (message: any, context?: string) => {
      pinoLogger.warn({ context }, message);
    },
    debug: (message: any, context?: string) => {
      pinoLogger.debug({ context }, message);
    },
    verbose: (message: any, context?: string) => {
      pinoLogger.trace({ context }, message);
    },
  };
}

/**
 * Creates the MCP strategy every transport mode boots from.
 *
 * The strategy is the whole MCP server configuration (identity, icons, the
 * transports it serves). The same instance must be handed to both
 * `AppModule.forX()` (as `MCP_STRATEGY`) and the microservice connection, so
 * each entry point builds exactly one and passes it around.
 *
 * The strategy's own log output goes through the NestJS `Logger`, which every
 * entry point points at a pino instance — stderr for STDIO/tunnel, stdout for
 * HTTP — so it never collides with the protocol stream.
 *
 * @param transports - Transport instances the strategy should serve
 * @param identity - Name/version advertised as `serverInfo`, taken from the
 *   validated config so every mode advertises the same thing
 */
export function createMcpStrategy(
  transports: McpTransport[],
  identity: AppConfig["mcpServer"],
): McpStrategy {
  return new McpStrategy({
    name: identity.name,
    version: identity.version,
    icons: MCP_ICONS,
    transports,
  });
}
