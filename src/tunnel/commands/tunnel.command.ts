import { NestFactory } from "@nestjs/core";
import { AppModule } from "@/app.module";
import { CredentialsService } from "@/tunnel";
import { DeviceFlowService } from "@/tunnel";
import { TunnelClient, McpRequestHandler, TunnelClientError } from "@/tunnel";
import { TUNNEL_DEFAULTS } from "@/tunnel";
import { AppConfigService } from "@/app-config.service";
import { ConfigService } from "@nestjs/config";
import { buildConfigInput } from "@/config";

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
  const width = Math.max(title.length, url.length) + 4;
  const border = "─".repeat(width);

  console.log(`┌${border}┐`);
  console.log(`│ ${title}${" ".repeat(width - title.length - 1)}│`);
  console.log(`├${border}┤`);
  console.log(`│ ${url}${" ".repeat(width - url.length - 1)}│`);
  console.log(`└${border}┘`);
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
      return `✗ Cannot connect to tunnel server at ${url}
   Make sure the tunnel server is running.`;
    }
  }

  // Check for connection refused in error message
  if (error instanceof Error) {
    if (
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("connect ECONNREFUSED")
    ) {
      return `✗ Cannot connect to tunnel server at ${url}
   Make sure the tunnel server is running.`;
    }

    // Check for timeout
    if (
      error.message.includes("timeout") ||
      error.message.includes("Connection timeout")
    ) {
      return `✗ Connection timeout to ${url}
   The tunnel server may be unavailable or slow to respond.`;
    }

    // Check for auth errors
    if (
      error.message.includes("Unauthorized") ||
      error.message.includes("401")
    ) {
      return `✗ Authentication failed
   Your credentials may be invalid. Try: ankimcp --logout && ankimcp --login`;
    }
  }

  // Generic error
  const message = error instanceof Error ? error.message : String(error);
  return `✗ Failed to connect: ${message}`;
}

/**
 * Handle --tunnel command
 * Establishes a tunnel connection to the tunnel service
 *
 * Flow:
 * 1. Load credentials (or prompt to login)
 * 2. Create local NestJS HTTP server on random port
 * 3. Create McpRequestHandler that proxies to local server
 * 4. Connect to tunnel service via TunnelClient
 * 5. Display tunnel URL
 * 6. Listen for events (requests, errors, expiring, disconnected)
 * 7. Handle graceful shutdown on SIGINT/SIGTERM
 *
 * @param tunnelUrl - Optional custom tunnel URL (defaults to production)
 * @throws {Error} If not logged in or connection fails
 */
export async function handleTunnel(tunnelUrl?: string): Promise<void> {
  const credentialsService = new CredentialsService();
  const configService = new ConfigService();
  const appConfigService = new AppConfigService(configService);
  const deviceFlowService = new DeviceFlowService(appConfigService);

  console.log(); // Blank line for spacing

  try {
    // Step 1: Load credentials
    const credentials = await credentialsService.loadCredentials();
    if (!credentials) {
      console.error("✗ Not logged in. Run: ankimcp --login");
      console.log(); // Blank line
      process.exit(1);
    }

    // Step 2: Create local NestJS HTTP server on random port
    const stopSpinner = startSpinner("Starting local MCP server...");
    let app;
    let localPort: number;

    try {
      // Build config input from env (no CLI overrides in tunnel mode)
      const configInput = buildConfigInput();

      app = await NestFactory.create(AppModule.forHttp(configInput), {
        logger: false,
      });
      await app.listen(0, "127.0.0.1");
      const address = app.getHttpServer().address();
      localPort = typeof address === "object" ? address.port : 0;
      stopSpinner();
      console.log(`✓ Local MCP server started on port ${localPort}`);
    } catch (error) {
      stopSpinner();
      console.error(
        `✗ Failed to start local server: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.log(); // Blank line
      process.exit(1);
    }

    console.log(); // Blank line

    // Step 3: Create McpRequestHandler that proxies to local server
    const mcpHandler: McpRequestHandler = {
      async handle(request) {
        const response = await fetch(
          `http://127.0.0.1:${localPort}${request.path}`,
          {
            method: request.method,
            headers: request.headers,
            body: request.method !== "GET" ? request.body : undefined,
          },
        );

        const headers: Record<string, string> = {};
        response.headers.forEach((v, k) => {
          headers[k] = v;
        });

        return {
          status: response.status,
          headers,
          body: await response.text(),
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
        console.error(`✗ Tunnel error: ${error.message}`);
      }
      // Pre-connect errors are handled by the catch block below
    });

    const connectSpinner = startSpinner("Connecting to tunnel service...");
    let publicUrl: string;

    try {
      publicUrl = await tunnelClient.connect(tunnelUrl);
      connectSpinner();
      console.log("✓ Tunnel established");
      console.log(); // Blank line
    } catch (error) {
      connectSpinner();

      // Format user-friendly error message
      const errorMessage = formatConnectionError(error, tunnelUrl);
      console.error(errorMessage);
      console.log(); // Blank line
      await app.close();
      process.exit(1);
    }

    // Step 5: Display tunnel URL in a nice box
    displayBox("🚇 Tunnel URL", publicUrl);
    console.log(); // Blank line
    console.log("Tunnel is active. Press Ctrl+C to disconnect.");
    console.log(); // Blank line

    // Step 6: Listen for events (error listener already set up above)
    tunnelClient.on("request", (requestId: string, request) => {
      const timestamp = new Date().toISOString();
      console.log(
        `[${timestamp}] Request ${requestId}: ${request.method} ${request.path}`,
      );
    });

    tunnelClient.on("url_changed", (oldUrl: string, newUrl: string) => {
      console.log(); // Blank line
      console.log(`🔄 Tunnel URL changed:`);
      console.log(`   Old: ${oldUrl}`);
      console.log(`   New: ${newUrl}`);
      console.log(); // Blank line
    });

    tunnelClient.on("disconnected", (code: number, reason: string) => {
      console.log(); // Blank line
      console.log(`✗ Tunnel disconnected (code ${code}): ${reason}`);
      console.log(); // Blank line
    });

    // Step 7: Handle graceful shutdown
    const shutdown = async () => {
      console.log(); // Blank line
      console.log("Shutting down...");

      tunnelClient.disconnect();
      await app.close();

      console.log("✓ Tunnel closed");
      console.log(); // Blank line
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Keep process running
    await new Promise(() => {});
  } catch (error) {
    // Handle unexpected errors
    console.error(
      `✗ Tunnel failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.log(); // Blank line
    process.exit(1);
  }
}
