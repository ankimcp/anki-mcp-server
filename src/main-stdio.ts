import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  createPinoLogger,
  createLoggerService,
  LOG_DESTINATION,
} from "./bootstrap";
import { cli } from "./cli/cli-output";
import { buildConfigInput } from "./config";

async function bootstrap() {
  // Build config input from env (no CLI overrides in STDIO mode)
  const configInput = buildConfigInput();

  // Create logger that writes to stderr for STDIO mode (keeps stdout clear for MCP protocol)
  // Log level comes from configInput (LOG_LEVEL env variable)
  const pinoLogger = createPinoLogger(
    LOG_DESTINATION.STDERR,
    configInput.LOG_LEVEL || "info",
  );
  const loggerService = createLoggerService(pinoLogger);

  // STDIO mode - create application context (no HTTP server)
  await NestFactory.createApplicationContext(AppModule.forStdio(configInput), {
    logger: loggerService,
    bufferLogs: true,
  });

  pinoLogger.info("MCP STDIO server started successfully");

  // Keep the application running
  await new Promise(() => {});
}

bootstrap().catch((err) => {
  cli.error(
    `Failed to start MCP STDIO server: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : undefined,
  );
  process.exit(1);
});
