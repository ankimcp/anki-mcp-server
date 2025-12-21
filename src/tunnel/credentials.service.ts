import { readFile, writeFile, unlink, mkdir, access, chmod } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { constants } from "fs";
import { Logger } from "@nestjs/common";

/**
 * Tunnel credentials structure stored in ~/.ankimcp/credentials.json
 *
 * User data is enriched by the tunnel service with tier and custom slug information.
 */
export interface TunnelCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601 timestamp
  user: {
    id: string;
    email: string;
    tier: "free" | "paid";
    customSlug: string | null;
  };
}

/**
 * Service for managing tunnel authentication credentials
 *
 * Credentials are stored in plaintext at ~/.ankimcp/credentials.json with
 * 0o600 permissions (owner read/write only). This follows industry standard
 * for CLI tools (ngrok, AWS CLI, kubectl, Docker).
 *
 * Security model:
 * - Tokens are user-scoped (compromise affects only that user)
 * - Tokens can be revoked via logout or web dashboard
 * - Short-lived access tokens (1 hour) limit exposure window
 * - Refresh tokens require server validation (can be revoked server-side)
 */
export class CredentialsService {
  private readonly logger = new Logger(CredentialsService.name);
  private static readonly CREDENTIALS_DIR = join(homedir(), ".ankimcp");
  private static readonly CREDENTIALS_FILE = join(
    CredentialsService.CREDENTIALS_DIR,
    "credentials.json",
  );

  /**
   * Get the path to the credentials file
   * @returns Absolute path to ~/.ankimcp/credentials.json
   */
  getCredentialsPath(): string {
    return CredentialsService.CREDENTIALS_FILE;
  }

  /**
   * Save credentials to disk with secure permissions
   * Creates ~/.ankimcp directory if it doesn't exist
   *
   * @param credentials - Credentials to save
   * @throws Error if write fails (permission issues, disk full, etc.)
   */
  async saveCredentials(credentials: TunnelCredentials): Promise<void> {
    try {
      // Ensure directory exists with secure permissions
      await this.ensureCredentialsDirectory();

      // Write credentials to file
      const content = JSON.stringify(credentials, null, 2);
      await writeFile(CredentialsService.CREDENTIALS_FILE, content, {
        encoding: "utf-8",
        mode: 0o600, // Owner read/write only
      });

      // Explicitly set permissions (in case umask interferes)
      await chmod(CredentialsService.CREDENTIALS_FILE, 0o600);
    } catch (error) {
      throw new Error(
        `Failed to save credentials to ${CredentialsService.CREDENTIALS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Load credentials from disk
   * Returns null if file doesn't exist or is corrupted
   *
   * @returns Credentials or null if not found/corrupted
   */
  async loadCredentials(): Promise<TunnelCredentials | null> {
    try {
      // Check if file exists
      await access(
        CredentialsService.CREDENTIALS_FILE,
        constants.F_OK | constants.R_OK,
      );

      // Read and parse credentials
      const content = await readFile(CredentialsService.CREDENTIALS_FILE, {
        encoding: "utf-8",
      });
      const credentials = JSON.parse(content) as TunnelCredentials;

      // Validate structure
      if (!this.isValidCredentials(credentials)) {
        this.logger.warn(
          `Corrupted credentials file at ${CredentialsService.CREDENTIALS_FILE}`,
        );
        return null;
      }

      return credentials;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist - this is expected for first-time users
        return null;
      }

      // JSON parse error or other read errors
      this.logger.warn(
        `Failed to load credentials from ${CredentialsService.CREDENTIALS_FILE}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Delete credentials file from disk
   * Does not throw if file doesn't exist
   */
  async clearCredentials(): Promise<void> {
    try {
      await unlink(CredentialsService.CREDENTIALS_FILE);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          `Failed to delete credentials file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      // File doesn't exist - that's fine, nothing to clear
    }
  }

  /**
   * Check if credentials file exists on disk
   * @returns true if credentials file exists
   */
  async hasCredentials(): Promise<boolean> {
    try {
      await access(CredentialsService.CREDENTIALS_FILE, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if access token is expired
   * Uses 60-second buffer to avoid race conditions
   *
   * @param credentials - Credentials to check
   * @returns true if access_token is expired (or within 60s of expiry)
   */
  isTokenExpired(credentials: TunnelCredentials): boolean {
    const expiresAt = new Date(credentials.expires_at).getTime();
    const now = Date.now();
    const bufferMs = 60 * 1000; // 60 seconds

    return now >= expiresAt - bufferMs;
  }

  /**
   * Ensure ~/.ankimcp directory exists with secure permissions
   * Creates directory with 0o700 (owner rwx only) if it doesn't exist
   */
  private async ensureCredentialsDirectory(): Promise<void> {
    try {
      await access(CredentialsService.CREDENTIALS_DIR, constants.F_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // Directory doesn't exist - create it
        await mkdir(CredentialsService.CREDENTIALS_DIR, {
          recursive: true,
          mode: 0o700, // Owner rwx only
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Validate credentials structure
   * Basic runtime type checking for loaded credentials
   */
  private isValidCredentials(obj: unknown): obj is TunnelCredentials {
    if (!obj || typeof obj !== "object") {
      return false;
    }

    const creds = obj as Record<string, unknown>;
    const user = creds.user as Record<string, unknown>;

    return (
      typeof creds.access_token === "string" &&
      typeof creds.refresh_token === "string" &&
      typeof creds.expires_at === "string" &&
      typeof creds.user === "object" &&
      creds.user !== null &&
      typeof user.id === "string" &&
      typeof user.email === "string" &&
      (user.tier === "free" || user.tier === "paid") &&
      (user.customSlug === null || typeof user.customSlug === "string")
    );
  }
}
