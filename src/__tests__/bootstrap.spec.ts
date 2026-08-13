import { createLoggerService } from "../bootstrap";

/**
 * Unit tests for the pino → NestJS LoggerService adapter.
 *
 * The router-context demotion exists because mcp-nest v2 turns every capability
 * class into a controller with no HTTP routes, so Nest announces ~50 of them
 * under `RoutesResolver` at startup.
 */
describe("createLoggerService", () => {
  function createHarness() {
    const pinoLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      trace: jest.fn(),
    };
    return { pinoLogger, logger: createLoggerService(pinoLogger) };
  }

  describe("log level routing", () => {
    it("demotes RoutesResolver messages to debug", () => {
      const { pinoLogger, logger } = createHarness();

      logger.log("SyncTool {/}:", "RoutesResolver");

      expect(pinoLogger.debug).toHaveBeenCalledWith(
        { context: "RoutesResolver" },
        "SyncTool {/}:",
      );
      expect(pinoLogger.info).not.toHaveBeenCalled();
    });

    it("keeps other contexts at info", () => {
      const { pinoLogger, logger } = createHarness();

      logger.log("Nest application successfully started", "NestApplication");

      expect(pinoLogger.info).toHaveBeenCalledWith(
        { context: "NestApplication" },
        "Nest application successfully started",
      );
      expect(pinoLogger.debug).not.toHaveBeenCalled();
    });

    it("keeps RouterExplorer at info so mapped MCP routes stay visible", () => {
      const { pinoLogger, logger } = createHarness();

      logger.log("Mapped {/, POST} route", "RouterExplorer");

      expect(pinoLogger.info).toHaveBeenCalledWith(
        { context: "RouterExplorer" },
        "Mapped {/, POST} route",
      );
      expect(pinoLogger.debug).not.toHaveBeenCalled();
    });

    it("keeps context-less messages at info", () => {
      const { pinoLogger, logger } = createHarness();

      logger.log("no context here");

      expect(pinoLogger.info).toHaveBeenCalledWith(
        { context: undefined },
        "no context here",
      );
      expect(pinoLogger.debug).not.toHaveBeenCalled();
    });
  });

  describe("non-log levels are never remapped", () => {
    it("warns at warn even in a demoted context", () => {
      const { pinoLogger, logger } = createHarness();

      logger.warn("route conflict", "RoutesResolver");

      expect(pinoLogger.warn).toHaveBeenCalledWith(
        { context: "RoutesResolver" },
        "route conflict",
      );
      expect(pinoLogger.debug).not.toHaveBeenCalled();
      expect(pinoLogger.info).not.toHaveBeenCalled();
    });

    it("errors at error even in a demoted context", () => {
      const { pinoLogger, logger } = createHarness();

      logger.error("route explosion", "stack trace", "RoutesResolver");

      expect(pinoLogger.error).toHaveBeenCalledWith(
        { context: "RoutesResolver", trace: "stack trace" },
        "route explosion",
      );
      expect(pinoLogger.debug).not.toHaveBeenCalled();
      expect(pinoLogger.info).not.toHaveBeenCalled();
    });

    it("passes debug and verbose through unchanged", () => {
      const { pinoLogger, logger } = createHarness();

      logger.debug?.("debug message", "RoutesResolver");
      logger.verbose?.("verbose message", "NestApplication");

      expect(pinoLogger.debug).toHaveBeenCalledWith(
        { context: "RoutesResolver" },
        "debug message",
      );
      expect(pinoLogger.trace).toHaveBeenCalledWith(
        { context: "NestApplication" },
        "verbose message",
      );
      expect(pinoLogger.info).not.toHaveBeenCalled();
    });
  });
});
