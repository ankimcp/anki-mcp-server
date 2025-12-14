import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "@/app.module";
import { CredentialsService } from "@/tunnel";
import { DeviceFlowService } from "@/tunnel";
import { TunnelClient, McpRequestHandler, TunnelClientError } from "@/tunnel";
import { TUNNEL_DEFAULTS } from "@/tunnel";
import { TunnelMcpService } from "@/tunnel/tunnel-mcp.service";
import { AppConfigService } from "@/app-config.service";
import { loadValidatedConfig } from "@/config";
import { cli, setDebugMode } from "@/cli/cli-output";
import {
  createPinoLogger,
  createLoggerService,
  LOG_DESTINATION,
} from "@/bootstrap";

/**
 * Display a simple text spinner for polling
 * Returns a function to stop the spinner
 */
function startSpinner(message: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;

  const interval = setInterval(() => {
    process.stdout.write(`\r${frames[i]} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(interval);
    process.stdout.write("\r"); // Clear spinner line
  };
}

/**
 * Display a URL in a nice box
 */
function displayBox(title: string, url: string): void {
  cli.box(title, url);
}

/**
 * Format connection errors with user-friendly messages
 */
function formatConnectionError(error: unknown, tunnelUrl?: string): string {
  const url = tunnelUrl || TUNNEL_DEFAULTS.URL;

  // Check for ECONNREFUSED (server not running)
  if (error instanceof TunnelClientError && error.originalError) {
    const origError = error.originalError as { code?: string };
    if (origError.code === "ECONNREFUSED") {
      return `Cannot connect to tunnel server at ${url}
   Make sure the tunnel server is running.`;
    }
  }

  // Check for connection refused in error message
  if (error instanceof Error) {
    if (
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("connect ECONNREFUSED")
    ) {
      return `Cannot connect to tunnel server at ${url}
   Make sure the tunnel server is running.`;
    }

    // Check for timeout
    if (
      error.message.includes("timeout") ||
      error.message.includes("Connection timeout")
    ) {
      return `Connection timeout to ${url}
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
 * Handle --tunnel command
 * Establishes a tunnel connection to the tunnel service
 *
 * Flow:
 * 1. Load credentials (or prompt to login)
 * 2. Create NestJS application context with in-memory MCP service
 * 3. Create McpRequestHandler that calls TunnelMcpService directly
 * 4. Connect to tunnel service via TunnelClient
 * 5. Display tunnel URL
 * 6. Listen for events (requests, errors, expiring, disconnected)
 * 7. Handle graceful shutdown on SIGINT/SIGTERM
 *
 * @param tunnelUrl - Optional custom tunnel URL (defaults to production)
 * @param debug - Optional debug mode flag
 * @throws {Error} If not logged in or connection fails
 */
export async function handleTunnel(
  tunnelUrl?: string,
  debug?: boolean,
): Promise<void> {
  // Set debug mode early so all error handlers can show stack traces
  setDebugMode(debug || false);

  const credentialsService = new CredentialsService();
  const validatedConfig = loadValidatedConfig({ debug });
  const appConfigService = new AppConfigService(validatedConfig);
  const deviceFlowService = new DeviceFlowService(appConfigService);

  cli.blank();

  try {
    // Step 1: Load credentials
    const credentials = await credentialsService.loadCredentials();
    if (!credentials) {
      cli.error("Not logged in. Run: ankimcp --login");
      cli.blank();
      process.exit(1);
    }

    // Step 2: Create NestJS application context with in-memory MCP service
    const stopSpinner = startSpinner("Starting MCP service...");
    let app;
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
        AppModule.forTunnel({ debug }),
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
      process.exit(1);
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
    const tunnelClient = new TunnelClient(
      mcpHandler,
      credentialsService,
      deviceFlowService,
      tunnelUrl,
    );

    // Set up error listener BEFORE connecting to prevent unhandled 'error' event crash
    // (Node's EventEmitter throws if 'error' event has no listener)
    tunnelClient.on("error", (error: Error) => {
      // During connect(), errors are caught by try/catch, so we only log post-connect errors
      if (tunnelClient.isConnected()) {
        cli.error(`Tunnel error: ${error.message}`, error);
      }
      // Pre-connect errors are handled by the catch block below
    });

    const connectSpinner = startSpinner("Connecting to tunnel service...");
    let publicUrl: string;

    try {
      publicUrl = await tunnelClient.connect(tunnelUrl);
      connectSpinner();
      cli.success("Tunnel established");
      cli.blank();
    } catch (error) {
      connectSpinner();

      // Format user-friendly error message
      const errorMessage = formatConnectionError(error, tunnelUrl);
      cli.error(errorMessage, error instanceof Error ? error : undefined);
      cli.blank();
      await app.close();
      process.exit(1);
    }

    // Step 5: Display tunnel URL in a nice box
    displayBox("🚇 Tunnel URL", publicUrl);
    cli.blank();
    cli.info("Tunnel is active. Press Ctrl+C to disconnect.");
    cli.blank();

    // Step 6: Listen for events (error listener already set up above)
    tunnelClient.on("request", (requestId: string, request) => {
      const timestamp = new Date().toISOString();
      console.log(
        `[${timestamp}] Request ${requestId}: ${request.method} ${request.path}`,
      );
    });

    tunnelClient.on("url_changed", (oldUrl: string, newUrl: string) => {
      cli.blank();
      cli.info(`🔄 Tunnel URL changed:`);
      cli.info(`   Old: ${oldUrl}`);
      cli.info(`   New: ${newUrl}`);
      cli.blank();
    });

    tunnelClient.on("disconnected", (code: number, reason: string) => {
      cli.blank();
      cli.error(`Tunnel disconnected (code ${code}): ${reason}`);
      cli.blank();
    });

    // Step 7: Handle graceful shutdown
    const shutdown = async () => {
      cli.blank();
      cli.info("Shutting down...");

      tunnelClient.disconnect();
      await app.close();

      cli.success("Tunnel closed");
      cli.blank();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep process running
    await new Promise(() => {});
  } catch (error) {
    // Handle unexpected errors
    cli.error(
      `Tunnel failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
    cli.blank();
    process.exit(1);
  }
}
