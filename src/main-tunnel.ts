import { parseCliArgs, checkForUpdates } from "./cli";
import { cli, setDebugMode } from "./cli/cli-output";
import { handleLogin, handleLogout, handleTunnel } from "./tunnel";

async function bootstrap() {
  // Check for updates (non-blocking, cached)
  checkForUpdates();

  const options = parseCliArgs();

  // Set debug mode early so all error handlers can show stack traces
  setDebugMode(options.debug);

  // Handle auth commands first (mutually exclusive with tunnel mode)
  if (options.login) {
    const loginUrl =
      typeof options.login === "string" ? options.login : undefined;
    await handleLogin(loginUrl);
    process.exit(0);
  }

  if (options.logout) {
    await handleLogout();
    process.exit(0);
  }

  // Main tunnel mode - always runs (this is the tunnel entry point)
  // The --tunnel flag is optional here, only used to override the URL
  const tunnelUrl =
    typeof options.tunnel === "string" ? options.tunnel : undefined;
  await handleTunnel(tunnelUrl, options.debug);
}

bootstrap().catch((err) => {
  cli.error(
    `Failed to start tunnel: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : undefined,
  );
  process.exit(1);
});
