import { CredentialsService } from "../credentials.service";

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
    console.log("\nNot logged in. Nothing to do.");
    return;
  }

  // Clear credentials
  try {
    await credentialsService.clearCredentials();

    console.log("\n✓ Logged out successfully.");
    console.log(
      `Credentials removed from ${credentialsService.getCredentialsPath()}`,
    );
  } catch (error) {
    console.error(
      `\nFailed to remove credentials: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
