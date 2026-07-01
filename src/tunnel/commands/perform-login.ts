import {
  CredentialsService,
  DeviceFlowError,
  DeviceFlowService,
  TunnelCredentials,
} from "@/tunnel";
import type { Cli } from "@/cli/cli-output";
import { startSpinner } from "@/cli/spinner";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Dependencies required by {@link performLogin}.
 *
 * Injected by callers so the function is testable in isolation and does not
 * implicitly couple to specific instances (loose coupling / DIP). The `cli`
 * surface is passed in too — there is no module-level `cli` to fall back on.
 */
export interface PerformLoginDeps {
  credentialsService: CredentialsService;
  deviceFlowService: DeviceFlowService;
  cli: Cli;
}

/**
 * Open URL in default browser using platform-specific commands.
 *
 * Uses {@link execFile} (argv array, no shell) so shell metacharacters in the
 * URL — `$()`, backticks, quotes — cannot be interpreted by a shell. On
 * Windows, `cmd /c start` requires an empty title argument before the URL,
 * otherwise the first quoted arg is consumed as the console window title and
 * the URL never opens.
 *
 * Gracefully degrades on failure (non-critical UX enhancement) — the URL is
 * always printed regardless.
 */
async function openBrowser(url: string): Promise<void> {
  try {
    switch (process.platform) {
      case "darwin":
        await execFileAsync("open", [url]);
        break;
      case "win32":
        // Empty "" is `start`'s title placeholder — without it, the URL is
        // consumed as the new console window title and never opens.
        await execFileAsync("cmd", ["/c", "start", "", url]);
        break;
      default:
        await execFileAsync("xdg-open", [url]);
        break;
    }
  } catch {
    // Silently fail - URL is displayed anyway.
  }
}

/**
 * Translate a {@link DeviceFlowError} into a single user-facing CLI message.
 *
 * Centralised so every caller of {@link performLogin} renders the same
 * actionable message for each failure mode (timeouts, denials, network).
 */
export function translateDeviceFlowError(error: DeviceFlowError): string {
  switch (error.code) {
    case "expired_token":
      return "Authentication timed out. Please try again with 'ankimcp --login'";
    case "access_denied":
      return "Authentication was denied. Please try again with 'ankimcp --login'";
    case "network_error":
    case "timeout":
      return "Failed to connect to auth server. Check your internet connection.";
    default:
      return `Authentication failed: ${error.message}`;
  }
}

/**
 * Print a login / device-flow failure as a single user-facing CLI message.
 *
 * Shared by every caller that runs {@link performLogin} (the explicit `--login`
 * command, the missing-credentials auto-login, and the session-expired
 * auto-relogin) so the wording stays identical across all paths. A
 * {@link DeviceFlowError} is rendered via {@link translateDeviceFlowError};
 * anything else falls back to a generic `Login failed: …` line.
 *
 * This helper only PRINTS — it never terminates the process. Each call site
 * keeps its own exit policy (`process.exit` vs. `gracefulExit`).
 */
export function reportLoginError(cli: Cli, error: unknown): void {
  if (error instanceof DeviceFlowError) {
    cli.error(translateDeviceFlowError(error));
  } else {
    cli.error(
      `Login failed: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Run the OAuth Device Flow end-to-end and persist credentials.
 *
 * This is the shared core used by both the explicit `--login` CLI command and
 * the auto-trigger path inside `--tunnel`. It:
 *
 * 1. Requests a device code from the tunnel service.
 * 2. Prints the verification URL + user code and tries to open a browser.
 * 3. Polls for token completion (with a spinner).
 * 4. Saves the resulting credentials.
 *
 * It does NOT call `process.exit` — the caller decides how to react to
 * failures. On success it returns the persisted {@link TunnelCredentials} so
 * the caller does not have to re-read them from disk.
 *
 * @param deps - Services + cli to use (injected for testability).
 * @returns The credentials that were just saved.
 * @throws {DeviceFlowError} If the OAuth device flow fails (translate with
 *   {@link translateDeviceFlowError} for user-facing output).
 * @throws {Error} If credential persistence fails (filesystem error, etc.).
 */
export async function performLogin(
  deps: PerformLoginDeps,
): Promise<TunnelCredentials> {
  const { credentialsService, deviceFlowService, cli } = deps;

  // Step 1: Request device code
  const deviceCode = await deviceFlowService.requestDeviceCode();

  // Step 2: Display verification URL and code
  cli.info("Opening browser for authentication...");
  cli.info(`If browser doesn't open, visit: ${deviceCode.verification_uri}`);
  cli.info(`Enter code: ${deviceCode.user_code}`);
  cli.blank();

  // Step 3: Try to open browser (non-blocking, graceful degradation)
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

  // Step 5: Build credentials with enriched user data from tunnel service
  const expiresAt = new Date(
    Date.now() + tokenResponse.expires_in * 1000,
  ).toISOString();

  const credentials: TunnelCredentials = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: expiresAt,
    user: tokenResponse.user,
  };

  // Step 6: Save credentials
  await credentialsService.saveCredentials(credentials);

  // Step 7: Display success message with tier information
  cli.info(`Logged in as: ${tokenResponse.user.email}`);
  cli.info(`Tier: ${tokenResponse.user.tier}`);
  cli.info(`Credentials saved to ${credentialsService.getCredentialsPath()}`);
  cli.blank();

  return credentials;
}
