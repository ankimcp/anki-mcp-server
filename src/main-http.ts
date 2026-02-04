import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { createPinoLogger, createLoggerService } from "./bootstrap";
import { OriginValidationGuard } from "./http/guards/origin-validation.guard";
import { parseCliArgs, displayStartupBanner, checkForUpdates } from "./cli";
import { NgrokService } from "./services/ngrok.service";

async function bootstrap() {
  // Check for updates (non-blocking, cached)
  checkForUpdates();

  const options = parseCliArgs();

  // Set environment variables from CLI options
  process.env.PORT = options.port.toString();
  process.env.HOST = options.host;
  process.env.ANKI_CONNECT_URL = options.ankiConnect;
  process.env.READ_ONLY = options.readOnly ? "true" : "false";

  // Create logger that writes to stdout (fd 1) for HTTP mode
  const pinoLogger = createPinoLogger(1);
  const loggerService = createLoggerService(pinoLogger);

  // HTTP mode - create NestJS HTTP application
  const app = await NestFactory.create(AppModule.forHttp(), {
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
      console.error("\n❌ Failed to start ngrok:");
      console.error(err instanceof Error ? err.message : String(err));
      console.error("\nServer is still running locally without tunnel.\n");
    }
  }

  // Show startup information
  displayStartupBanner(options, ngrokUrl);
}

bootstrap().catch((err) => {
  console.error("Failed to start MCP HTTP server:", err);
  process.exit(1);
});
