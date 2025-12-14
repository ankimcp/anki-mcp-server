import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import {
  createPinoLogger,
  createLoggerService,
  LOG_DESTINATION,
} from "./bootstrap";
import { OriginValidationGuard } from "./http/guards/origin-validation.guard";
import { parseCliArgs, displayStartupBanner, checkForUpdates } from "./cli";
import { cli, setDebugMode } from "./cli/cli-output";
import { NgrokService } from "./services/ngrok.service";
import { buildConfigInput } from "./config";

async function bootstrap() {
  // Check for updates (non-blocking, cached)
  checkForUpdates();

  const options = parseCliArgs();

  // Set debug mode early so all error handlers can show stack traces
  setDebugMode(options.debug);

  // Build config input from env + CLI overrides (no process.env mutation)
  const configInput = buildConfigInput({
    port: options.port,
    host: options.host,
    ankiConnect: options.ankiConnect,
    tunnel: options.tunnel,
    ngrok: options.ngrok,
    debug: options.debug,
  });

  // Create logger that writes to stdout for HTTP mode
  // Log level comes from configInput (set by --debug flag or LOG_LEVEL env)
  const pinoLogger = createPinoLogger(
    LOG_DESTINATION.STDOUT,
    configInput.LOG_LEVEL || "info",
  );
  const loggerService = createLoggerService(pinoLogger);

  // HTTP mode - create NestJS HTTP application
  const app = await NestFactory.create(AppModule.forHttp(configInput), {
    logger: loggerService,
    bufferLogs: true,
  });

  // Apply security guards (required by MCP Streamable HTTP spec)
  app.useGlobalGuards(new OriginValidationGuard());

  await app.listen(options.port, options.host);

  // Start ngrok if requested
  let ngrokUrl: string | undefined;
  if (options.ngrok) {
    try {
      const ngrokService = new NgrokService();
      const tunnelInfo = await ngrokService.start(options.port);
      ngrokUrl = tunnelInfo.publicUrl;
    } catch (err) {
      cli.blank();
      cli.error(
        `Failed to start ngrok: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined,
      );
      cli.blank();
      cli.info("Server is still running locally without tunnel.");
      cli.blank();
    }
  }

  // Show startup information
  displayStartupBanner(options, ngrokUrl);
}

bootstrap().catch((err) => {
  cli.error(
    `Failed to start MCP HTTP server: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : undefined,
  );
  process.exit(1);
});
