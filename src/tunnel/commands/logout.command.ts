import { CredentialsService } from "../credentials.service";
import { cli } from "@/cli/cli-output";

/**
 * Handle logout command
 *
 * Clears stored credentials from ~/.ankimcp/credentials.json
 *
 * @example
 * ```bash
 * # If logged in:
 * $ ankimcp --logout
 * ✓ Logged out successfully.
 * Credentials removed from ~/.ankimcp/credentials.json
 *
 * # If not logged in:
 * $ ankimcp --logout
 * Not logged in. Nothing to do.
 * ```
 */
export async function handleLogout(): Promise<void> {
  const credentialsService = new CredentialsService();

  // Check if credentials exist
  const hasCredentials = await credentialsService.hasCredentials();

  if (!hasCredentials) {
    cli.blank();
    cli.info("Not logged in. Nothing to do.");
    return;
  }

  // Clear credentials
  try {
    await credentialsService.clearCredentials();

    cli.blank();
    cli.success("Logged out successfully.");
    cli.info(
      `Credentials removed from ${credentialsService.getCredentialsPath()}`,
    );
  } catch (error) {
    cli.blank();
    cli.error(
      `Failed to remove credentials: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined,
    );
    process.exit(1);
  }
}
