import { parseCliArgs, parseOptionalUrl, checkForUpdates } from "./cli";
import { createCli } from "./cli/cli-output";
import { handleLogin, handleLogout, handleTunnel } from "./tunnel";

async function bootstrap() {
  // Check for updates (non-blocking, cached)
  checkForUpdates();

  const options = parseCliArgs();

  // Build the CLI output surface once with the parsed debug flag.
  // From here on, anything that needs user-facing output receives `cli`
  // explicitly — there is no module-level fallback.
  const cli = createCli(options.debug);

  // Handle auth commands first (mutually exclusive with tunnel mode).
  // URL values are validated at the parse boundary so a `--login ""` from a
  // shell expansion of an unset env var fails fast with a clear message
  // instead of silently falling back to the default URL.
  if (options.login) {
    const loginUrl = parseOptionalUrl(options.login, "--login", cli);
    await handleLogin(cli, loginUrl);
    process.exit(0);
  }

  if (options.logout) {
    await handleLogout(cli);
    process.exit(0);
  }

  // Main tunnel mode - always runs (this is the tunnel entry point).
  // `--tunnel` is optional; only used to override the URL.
  const tunnelUrl = parseOptionalUrl(options.tunnel, "--tunnel", cli);
  await handleTunnel(cli, tunnelUrl, options.debug, options.readOnly);
}

// Bootstrap-level error handler: we don't yet have a `cli` (options weren't
// parsed), so build a non-debug one for the failure path.
bootstrap().catch((err) => {
  const cli = createCli(false);
  cli.error(
    `Failed to start tunnel: ${err instanceof Error ? err.message : String(err)}`,
    err instanceof Error ? err : undefined,
  );
  process.exit(1);
});
