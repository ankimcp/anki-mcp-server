import { LoggerService } from "@nestjs/common";
import { pino } from "pino";

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
 * @param pinoLogger - The pino logger instance
 * @returns NestJS LoggerService implementation
 */
export function createLoggerService(pinoLogger: any): LoggerService {
  return {
    log: (message: any, context?: string) => {
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
