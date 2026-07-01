import { CredentialsService, DeviceFlowService } from "@/tunnel";
import { AppConfigService } from "@/app-config.service";
import { loadValidatedConfig } from "@/config";
import type { Cli } from "@/cli/cli-output";
import { performLogin, reportLoginError } from "./perform-login";

/**
 * Handle the explicit `--login` CLI command.
 *
 * Thin wrapper around {@link performLogin}: instantiates the services it needs,
 * delegates the OAuth device flow, and translates any failures into
 * user-facing CLI output before exiting.
 *
 * For the auto-login path triggered from `--tunnel`, see how `handleTunnel`
 * reuses {@link performLogin} directly with its own service instances.
 *
 * @param cli - User-facing output surface (constructed at bootstrap with the
 *   parsed `--debug` flag).
 * @param tunnelUrl - Optional custom tunnel URL (overrides `TUNNEL_SERVER_URL`
 *   env var). Affects which auth endpoints the device flow talks to, since
 *   the device/token URLs are derived from the tunnel URL.
 */
export async function handleLogin(cli: Cli, tunnelUrl?: string): Promise<void> {
  const credentialsService = new CredentialsService();
  const validatedConfig = loadValidatedConfig({ tunnel: tunnelUrl });
  const appConfigService = new AppConfigService(validatedConfig);
  const deviceFlowService = new DeviceFlowService(appConfigService);

  cli.blank();

  try {
    await performLogin({ credentialsService, deviceFlowService, cli });
  } catch (error) {
    cli.blank();
    reportLoginError(cli, error);
    cli.blank();
    process.exit(1);
  }
}
