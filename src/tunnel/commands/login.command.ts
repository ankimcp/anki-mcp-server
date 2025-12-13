import { exec } from "child_process";
import { promisify } from "util";
import { CredentialsService, TunnelCredentials } from "@/tunnel";
import { DeviceFlowService, DeviceFlowError } from "@/tunnel";
import { AppConfigService } from "@/app-config.service";
import { loadValidatedConfig } from "@/config";
import { cli } from "@/cli/cli-output";

const execAsync = promisify(exec);

/**
 * Decode JWT payload without verification
 * Safe because token came from our own OAuth flow, not user input
 *
 * @param token - JWT access token
 * @returns Decoded payload containing user info
 */
function decodeJwtPayload(token: string): {
  sub: string;
  email?: string;
  preferred_username?: string;
} {
  try {
    const payload = token.split(".")[1];
    const decoded = Buffer.from(payload, "base64url").toString("utf-8");
    return JSON.parse(decoded);
  } catch (error) {
    throw new Error(
      `Failed to decode JWT: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Open URL in default browser using platform-specific commands
 * Gracefully degrades on failure (non-critical UX enhancement)
 *
 * @param url - URL to open
 */
async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;

  try {
    let command: string;

    switch (platform) {
      case "darwin": // macOS
        command = `open "${url}"`;
        break;
      case "win32": // Windows
        command = `start "${url}"`;
        break;
      default: // Linux and others
        command = `xdg-open "${url}"`;
        break;
    }

    await execAsync(command);
  } catch (_error) {
    // Silently fail - URL is displayed anyway
    // Non-critical UX feature, shouldn't block login flow
  }
}

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
 * Handle --login command
 * Authenticates user with tunnel service via OAuth Device Flow
 *
 * Flow:
 * 1. Request device code from Keycloak
 * 2. Display verification URL and user code
 * 3. Attempt to open browser automatically
 * 4. Poll for token until user authorizes
 * 5. Save credentials on success
 * 6. Display success message with user email
 *
 * @throws {DeviceFlowError} If authentication fails
 * @throws {Error} If credential storage fails
 */
export async function handleLogin(): Promise<void> {
  const credentialsService = new CredentialsService();
  const validatedConfig = loadValidatedConfig();
  const appConfigService = new AppConfigService(validatedConfig);
  const deviceFlowService = new DeviceFlowService(appConfigService);

  cli.blank();

  try {
    // Step 1: Request device code
    const deviceCode = await deviceFlowService.requestDeviceCode();

    // Step 2: Display verification URL and code
    cli.info("Opening browser for authentication...");
    cli.info(`If browser doesn't open, visit: ${deviceCode.verification_uri}`);
    cli.info(`Enter code: ${deviceCode.user_code}`);
    cli.blank();

    // Step 3: Try to open browser (non-blocking, graceful degradation)
    // Use verification_uri_complete if available (pre-filled code)
    const urlToOpen =
      deviceCode.verification_uri_complete || deviceCode.verification_uri;
    await openBrowser(urlToOpen);

    // Step 4: Poll for token with spinner
    const stopSpinner = startSpinner("Waiting for authentication...");

    let tokenResponse;
    try {
      tokenResponse = await deviceFlowService.pollForToken(
        deviceCode.device_code,
        deviceCode.interval,
        deviceCode.expires_in,
      );
    } finally {
      stopSpinner();
    }

    cli.success("Authentication successful");
    cli.blank();

    // Step 5: Decode JWT to extract user info
    // Safe to decode without verification - token came from our own OAuth flow
    const payload = decodeJwtPayload(tokenResponse.access_token);
    const email = payload.email || payload.preferred_username || "unknown";
    const userId = payload.sub;

    // Calculate token expiry time
    const expiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    ).toISOString();

    // Step 6: Build and save credentials
    const credentials: TunnelCredentials = {
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt,
      user: {
        id: userId,
        email: email,
        tier: "free", // Default tier - will be updated by tunnel server on first connect
      },
    };

    await credentialsService.saveCredentials(credentials);

    // Step 7: Display success message
    cli.info(`Logged in as: ${email}`);
    cli.info(`Credentials saved to ${credentialsService.getCredentialsPath()}`);
    cli.blank();
  } catch (error) {
    // Handle Device Flow errors with user-friendly messages
    if (error instanceof DeviceFlowError) {
      cli.blank();

      switch (error.code) {
        case "expired_token":
          cli.error(
            "Authentication timed out. Please try again with 'ankimcp --login'",
          );
          break;

        case "access_denied":
          cli.error(
            "Authentication was denied. Please try again with 'ankimcp --login'",
          );
          break;

        case "network_error":
        case "timeout":
          cli.error(
            "Failed to connect to auth server. Check your internet connection.",
          );
          break;

        default:
          cli.error(`Authentication failed: ${error.message}`);
          break;
      }

      cli.blank();
      process.exit(1);
    }

    // Handle other errors (filesystem, etc.)
    cli.blank();
    cli.error(
      `Login failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
    cli.blank();
    process.exit(1);
  }
}
