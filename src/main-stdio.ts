import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createPinoLogger, createLoggerService } from "./bootstrap";
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

  // Create logger that writes to stderr (fd 2) for STDIO mode
  const pinoLogger = createPinoLogger(2);
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
  console.error("Failed to start MCP STDIO server:", err);
  process.exit(1);
});
