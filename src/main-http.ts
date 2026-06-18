import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import {
  createPinoLogger,
  createLoggerService,
  LOG_DESTINATION,
} from "./bootstrap";
import {
  parseCliArgs,
  parseOptionalUrl,
  displayStartupBanner,
  checkForUpdates,
} from "./cli";
import { createCli } from "@/cli";
import { NgrokService } from "./services/ngrok.service";
import { buildConfigInput, configSchema, transformEnvToConfig } from "./config";
import { shouldWarnLoopbackOnly } from "./http/guards/host-validation.guard";

async function bootstrap() {
  // Check for updates (non-blocking, cached)
  checkForUpdates();

  const options = parseCliArgs();

  // Build the CLI output surface once with the parsed debug flag.
  // From here on, anything that needs user-facing output must receive `cli`
  // explicitly — there is no module-level fallback.
  const cli = createCli(options.debug);

  // Validate `--tunnel` URL at the parse boundary so an empty/garbage value
  // doesn't silently fall through `buildConfigInput` and either be ignored
  // (true/false) or fail Zod validation (empty string).
  const tunnelUrl = parseOptionalUrl(options.tunnel, "--tunnel", cli);

  // Build config input from env + CLI overrides (no process.env mutation)
  const configInput = buildConfigInput({
    port: options.port,
    host: options.host,
    ankiConnect: options.ankiConnect,
    readOnly: options.readOnly,
    tunnel: tunnelUrl,
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
  // Security guards (Origin + Host validation, required by the MCP Streamable
  // HTTP spec) are registered at module level via APP_GUARD in forHttp().
  const app = await NestFactory.create(AppModule.forHttp(configInput), {
    logger: loggerService,
    bufferLogs: true,
  });

  // Fail-closed warning: binding to a non-loopback address without an explicit
  // ALLOWED_HOSTS means only loopback Host headers are accepted, so requests
  // arriving via the machine's LAN/public hostname will be rejected. The
  // emptiness check is sourced from the validated config (not raw process.env)
  // so CLI overrides and Zod parsing are honored.
  const validatedConfig = configSchema.parse(transformEnvToConfig(configInput));
  const boundHost = options.host;
  if (shouldWarnLoopbackOnly(boundHost, validatedConfig.allowedHosts)) {
    new Logger("HttpBootstrap").warn(
      `Server is bound to ${boundHost} but ALLOWED_HOSTS is not set. ` +
        `For DNS-rebinding protection, only loopback Host headers ` +
        `(localhost, 127.0.0.1, ::1) are accepted — requests via a LAN or ` +
        `public hostname will be rejected with 403. Set ALLOWED_HOSTS ` +
        `(comma-separated hostnames) to permit them.`,
    );
  }

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
  displayStartupBanner(cli, options, ngrokUrl);
}

// Bootstrap-level error handler: we don't yet have a `cli` (options weren't
// parsed), so we build a non-debug one for the failure path.
bootstrap().catch((err) => {
  const cli = createCli(false);
  cli.error(
    `Failed to start MCP HTTP server: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : undefined,
  );
  process.exit(1);
});
