import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  createPinoLogger,
  createLoggerService,
  LOG_DESTINATION,
} from "./bootstrap";
import { cli } from "./cli/cli-output";
import { buildConfigInput } from "./config";

/**
 * Parse minimal CLI args for STDIO mode.
 * Only parses --read-only and --anki-connect flags.
 */
function parseStdioArgs(): { readOnly: boolean; ankiConnect?: string } {
  const args = process.argv.slice(2);
  let readOnly = false;
  let ankiConnect: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--read-only") {
      readOnly = true;
    } else if (args[i] === "--anki-connect" || args[i] === "-a") {
      ankiConnect = args[i + 1];
      i++; // Skip the next arg since we consumed it
    }
  }

  return { readOnly, ankiConnect };
}

async function bootstrap() {
  // Parse CLI args for STDIO mode
  const cliOptions = parseStdioArgs();

  // Build config input from env + CLI overrides (no process.env mutation)
  const configInput = buildConfigInput({
    ankiConnect: cliOptions.ankiConnect,
    readOnly: cliOptions.readOnly,
  });

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

  if (cliOptions.readOnly) {
    pinoLogger.info("MCP STDIO server started in READ-ONLY mode");
  } else {
    pinoLogger.info("MCP STDIO server started successfully");
  }

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
