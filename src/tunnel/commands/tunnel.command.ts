import { NestFactory } from "@nestjs/core";
import { Logger, type INestApplicationContext } from "@nestjs/common";
import { AppModule } from "@/app.module";
import {
  CredentialsService,
  DeviceFlowError,
  DeviceFlowService,
  McpRequestHandler,
  TunnelClient,
  TunnelClientError,
  TunnelCredentials,
} from "@/tunnel";
import { TunnelMcpService } from "@/tunnel/tunnel-mcp.service";
import { AppConfigService } from "@/app-config.service";
import { loadValidatedConfig } from "@/config";
import { formatBanner, type Cli } from "@/cli/cli-output";
import { startSpinner } from "@/cli/spinner";
import {
  createPinoLogger,
  createLoggerService,
  LOG_DESTINATION,
} from "@/bootstrap";
import { performLogin, translateDeviceFlowError } from "./perform-login";

/**
 * Display a URL in a nice box
 */
function displayBox(cli: Cli, title: string, url: string): void {
  cli.box(title, url);
}

/**
 * Derive the web dashboard URL from the public tunnel URL.
 *
 * The dashboard lives on the `web.` sibling of the tunnel host — e.g.
 * `https://tunnel.ankimcp.ai/<uuid>` becomes `https://web.ankimcp.ai`. We swap
 * the host of the *actual* tunnel URL (the one the server handed back), not a
 * config value, so a custom or self-hosted tunnel server still yields a
 * consistent `web.` dashboard host.
 *
 * The result is the bare origin only — the per-tunnel uuid path is dropped, as
 * the box is just a link to the web GUI, not a deep link.
 *
 * Only a leading `tunnel.` label is swapped; the swap is anchored so it never
 * matches inside the path. Hosts without a leading `tunnel.` label (e.g.
 * `localhost`) are left unchanged, so the dashboard host equals the tunnel
 * host in that case.
 */
export function deriveDashboardUrl(tunnelUrl: string): string {
  const url = new URL(tunnelUrl);
  url.hostname = url.hostname.replace(/^tunnel\./, "web.");
  return url.origin;
}

/**
 * Format connection errors with user-friendly messages.
 *
 * The `tunnelUrl` argument is the resolved URL the caller is actually using
 * (CLI flag → env → schema default). It's required: bare-default fallbacks
 * would lie to the user about which host failed.
 */
function formatConnectionError(error: unknown, tunnelUrl: string): string {
  // Check for ECONNREFUSED (server not running)
  if (error instanceof TunnelClientError && error.originalError) {
    const origError = error.originalError as { code?: string };
    if (origError.code === "ECONNREFUSED") {
      return `Cannot connect to tunnel server at ${tunnelUrl}
   Make sure the tunnel server is running.`;
    }
  }

  // Check for connection refused in error message
  if (error instanceof Error) {
    if (
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("connect ECONNREFUSED")
    ) {
      return `Cannot connect to tunnel server at ${tunnelUrl}
   Make sure the tunnel server is running.`;
    }

    // Check for timeout
    if (
      error.message.includes("timeout") ||
      error.message.includes("Connection timeout")
    ) {
      return `Connection timeout to ${tunnelUrl}
   The tunnel server may be unavailable or slow to respond.`;
    }

    // Check for auth errors
    if (
      error.message.includes("Unauthorized") ||
      error.message.includes("401")
    ) {
      return `Authentication failed
   Your credentials may be invalid. Try: ankimcp --logout && ankimcp --login`;
    }
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return `Failed to connect: ${message}`;
}

/**
 * Ensure we have valid credentials, triggering the login flow if missing.
 *
 * Returns the loaded credentials, or — when none exist — runs `performLogin()`
 * inline and returns the freshly minted credentials. On login failure this
 * prints a translated CLI message and exits the process with code 1.
 *
 * This runs BEFORE the NestJS application context is constructed, so a hard
 * `process.exit(1)` is correct here — there is no `app` to gracefully close.
 *
 * Service instances are reused from the caller so we don't double-instantiate
 * `CredentialsService` / `DeviceFlowService` for the auto-login path.
 */
async function ensureCredentials(
  cli: Cli,
  credentialsService: CredentialsService,
  deviceFlowService: DeviceFlowService,
): Promise<TunnelCredentials> {
  const existing = await credentialsService.loadCredentials();
  if (existing) {
    return existing;
  }

  // Device flow polls a remote URL and shows the user a code — it inherently
  // needs an interactive session (a browser, plus visibility of the printed
  // code). If we're running headless (systemd, Docker without `-it`, CI),
  // polling would hang for ~10 minutes with the user never seeing the prompt.
  // Fast-fail with an actionable message instead.
  if (!process.stdout.isTTY) {
    cli.error(
      "Not logged in and running non-interactively. Run: ankimcp --login first.",
    );
    process.exit(1);
  }

  cli.info("Not logged in — starting authentication flow...");
  cli.blank();

  try {
    const credentials = await performLogin({
      credentialsService,
      deviceFlowService,
      cli,
    });
    cli.info("Continuing to tunnel...");
    cli.blank();
    return credentials;
  } catch (error) {
    cli.blank();

    if (error instanceof DeviceFlowError) {
      cli.error(translateDeviceFlowError(error));
    } else {
      cli.error(
        `Login failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
    }

    cli.blank();
    process.exit(1);
  }
}

/**
 * Handle --tunnel command
 * Establishes a tunnel connection to the tunnel service
 *
 * Flow:
 * 1. Load credentials (auto-triggers `--login` flow if missing)
 * 2. Create NestJS application context with in-memory MCP service
 * 3. Create McpRequestHandler that calls TunnelMcpService directly
 * 4. Connect to tunnel service via TunnelClient (passing the loaded
 *    credentials so it doesn't re-read them from disk, and the fully
 *    resolved URL so the client doesn't re-resolve internally)
 * 5. Display tunnel URL
 * 6. Listen for events (requests, errors, disconnected)
 * 7. Handle graceful shutdown on SIGINT/SIGTERM via the local `gracefulExit`
 *
 * @param cli - User-facing output surface (constructed at bootstrap; debug flag
 *   is already baked into `cli.error`).
 * @param tunnelUrl - Optional custom tunnel URL (defaults to production)
 * @param debug - Optional debug mode flag (controls NestJS log levels — the
 *   `cli` parameter already has the debug flag bound for stack-trace output).
 * @param readOnly - Optional read-only mode flag
 * @throws {Error} If connection fails
 */
export async function handleTunnel(
  cli: Cli,
  tunnelUrl?: string,
  debug?: boolean,
  readOnly?: boolean,
): Promise<void> {
  const credentialsService = new CredentialsService();
  // Pass tunnelUrl through to config so the device flow targets the same host
  // as the tunnel itself (the auth endpoints are derived from this URL).
  const validatedConfig = loadValidatedConfig({
    debug,
    readOnly,
    tunnel: tunnelUrl,
  });
  const appConfigService = new AppConfigService(validatedConfig);
  const deviceFlowService = new DeviceFlowService(appConfigService);

  // Closed over by `gracefulExit` below. Declared up front so the helper can
  // see whichever values exist when a signal arrives — `app` is undefined
  // until step 2 succeeds, `tunnelClient` until step 4.
  let app: INestApplicationContext | undefined;
  let tunnelClient: TunnelClient | undefined;

  // Reentrancy guard for the shutdown helper. A second Ctrl+C during cleanup
  // should force-exit immediately rather than spawn a parallel shutdown.
  let shuttingDown = false;

  /**
   * Single exit point. Cleans up the tunnel client and Nest app (in that
   * order — disconnect drops the socket so Nest's shutdown isn't racing with
   * inbound traffic) before terminating the process.
   *
   * Returns `Promise<never>` so call sites can use `return await gracefulExit(...)`
   * and have TypeScript's flow analysis treat the call as terminating without
   * needing definite-assignment assertions on later variables.
   */
  const gracefulExit = async (
    code: number,
    message?: string,
  ): Promise<never> => {
    if (shuttingDown) {
      // Already cleaning up — caller pressed Ctrl+C twice (or two paths raced).
      // Skip cleanup and exit immediately so the user isn't stuck.
      process.exit(code);
    }
    shuttingDown = true;

    try {
      if (message) {
        cli.info(message);
      }
      tunnelClient?.disconnect();
      if (app) {
        await app.close();
      }
    } catch (err) {
      cli.error(
        `Cleanup error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    process.exit(code);
  };

  cli.info(formatBanner("Tunnel"));
  cli.blank();

  try {
    // Step 1: Load credentials (or run login flow inline if missing).
    // We pass these straight to TunnelClient.connect() below so it skips its
    // own disk read on the initial connection. Reconnects inside TunnelClient
    // still load from disk on demand — that path is intentionally untouched.
    const credentials = await ensureCredentials(
      cli,
      credentialsService,
      deviceFlowService,
    );

    // Step 2: Create NestJS application context with in-memory MCP service
    const stopSpinner = startSpinner("Starting MCP service...");
    let tunnelMcpService: TunnelMcpService;

    // Create logger that writes to stderr (keeps stdout clear for CLI output)
    const logLevel = debug ? "debug" : "info";
    const pinoLogger = createPinoLogger(LOG_DESTINATION.STDERR, logLevel);
    const loggerService = createLoggerService(pinoLogger);

    // Enable debug log level for NestJS Logger instances (like TunnelClient)
    // Logger.overrideLogger with array sets logLevels, with object sets staticInstanceRef
    // We need BOTH: first set which levels are enabled, then set where logs go
    if (debug) {
      Logger.overrideLogger(["log", "error", "warn", "debug", "verbose"]);
    }
    Logger.overrideLogger(loggerService);

    try {
      app = await NestFactory.createApplicationContext(
        AppModule.forTunnel({ debug, readOnly }),
        {
          logger: loggerService,
        },
      );
      tunnelMcpService = app.get(TunnelMcpService);
      stopSpinner();
      cli.success("MCP service ready");
    } catch (error) {
      stopSpinner();
      cli.error(
        `Failed to start MCP service: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );
      cli.blank();
      // No app yet — gracefulExit will skip the Nest close path safely.
      return await gracefulExit(1);
    }

    cli.blank();

    // Step 3: Create McpRequestHandler that calls TunnelMcpService directly
    const mcpHandler: McpRequestHandler = {
      async handle(request) {
        const responseBody = await tunnelMcpService.handleRequest(request.body);
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: responseBody,
        };
      },
    };

    // Step 4: Connect to tunnel service via TunnelClient
    // Single source of URL truth: CLI arg > env var > schema default.
    // Invalid CLI URLs are already rejected by parseOptionalUrl at the boot
    // boundary, so any non-undefined `tunnelUrl` here is already validated.
    const effectiveTunnelUrl = tunnelUrl ?? validatedConfig.tunnel.serverUrl;

    tunnelClient = new TunnelClient(
      mcpHandler,
      credentialsService,
      deviceFlowService,
      effectiveTunnelUrl,
    );

    // Set up error listener BEFORE connecting to prevent unhandled 'error' event crash
    // (Node's EventEmitter throws if 'error' event has no listener)
    tunnelClient.on("error", (error: Error) => {
      // Check for session expired error
      if (
        error instanceof TunnelClientError &&
        error.code === "session_expired"
      ) {
        cli.blank();
        cli.error(error.message);
        // EventEmitter.emit is sync — fire and forget. The gracefulExit helper
        // handles its own awaits before process.exit, and the reentrancy guard
        // protects against a second signal arriving while we're cleaning up.
        void gracefulExit(1);
        return;
      }

      // During connect(), errors are caught by try/catch, so we only log post-connect errors
      if (tunnelClient?.isConnected()) {
        cli.error(`Tunnel error: ${error.message}`, error);
      }
      // Pre-connect errors are handled by the catch block below
    });

    const connectSpinner = startSpinner("Connecting to tunnel service...");
    let publicUrl: string;

    try {
      publicUrl = await tunnelClient.connect(credentials);
      connectSpinner();
      cli.success("Tunnel established");
      cli.blank();
    } catch (error) {
      connectSpinner();

      // Check for session expired error
      if (
        error instanceof TunnelClientError &&
        error.code === "session_expired"
      ) {
        cli.blank();
        cli.error(error.message);
        // `return await` so TS sees this branch as terminating — without it
        // `publicUrl` below is flagged as possibly-unassigned.
        return await gracefulExit(1);
      }

      // Format user-friendly error message using the URL we actually tried.
      const errorMessage = formatConnectionError(error, effectiveTunnelUrl);
      cli.error(errorMessage, error instanceof Error ? error : undefined);
      cli.blank();
      return await gracefulExit(1);
    }

    // Step 5: Display tunnel URL and the web dashboard URL in nice boxes.
    // The dashboard URL is derived from the live tunnel URL by swapping the
    // host (`tunnel.` → `web.`) so it stays consistent with self-hosted servers.
    displayBox(cli, "🚇 Tunnel URL", publicUrl);
    cli.blank();
    displayBox(cli, "🌐 Dashboard", deriveDashboardUrl(publicUrl));
    cli.blank();
    cli.info("Tunnel is active. Press Ctrl+C to disconnect.");
    cli.blank();

    // Step 6: Listen for events (error listener already set up above)
    const logger = new Logger("TunnelCommand");
    tunnelClient.on("request", (requestId: string, request) => {
      logger.log(`Request ${requestId}: ${request.method} ${request.path}`);
    });

    tunnelClient.on("disconnected", (code: number, reason: string) => {
      cli.blank();
      cli.error(`Tunnel disconnected (code ${code}): ${reason}`);
      cli.blank();
    });

    // Step 7: Handle graceful shutdown.
    //
    // `gracefulExit` is async, but Node won't await the promise returned from
    // a signal-handler callback. We wrap with `void` and a sync arrow so the
    // returned promise is explicitly discarded — without this, an `app.close`
    // rejection would surface as an unhandled rejection rather than the
    // controlled `cli.error` path inside `gracefulExit`.
    process.on("SIGINT", () => {
      cli.blank();
      void gracefulExit(0, "Shutting down...");
    });
    process.on("SIGTERM", () => {
      cli.blank();
      void gracefulExit(0, "Shutting down...");
    });

    // Keep process running
    await new Promise(() => {});
  } catch (error) {
    // Handle unexpected errors
    cli.error(
      `Tunnel failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
    cli.blank();
    await gracefulExit(1);
  }
}
