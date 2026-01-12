import { readFile, writeFile, unlink, mkdir, access, chmod } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { constants } from "fs";
import { Logger } from "@nestjs/common";

/**
 * Tunnel credentials structure stored in ~/.ankimcp/credentials.json
 *
 * User data is enriched by the tunnel service with tier information.
 */
export interface TunnelCredentials {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO 8601 timestamp
  user: {
    id: string;
    email: string;
    tier: "free" | "paid";
  };
}

/**
 * Credentials validation result
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
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
      const validation = this.validateCredentials(credentials);
      if (!validation.valid) {
        this.logger.warn(
          `Corrupted credentials file at ${CredentialsService.CREDENTIALS_FILE}:`,
        );
        validation.errors.forEach((error) => {
          this.logger.warn(`  - ${error}`);
        });
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
   * Validate credentials structure with detailed error reporting
   * Performs comprehensive runtime type checking for loaded credentials
   *
   * @param obj - Object to validate
   * @returns Validation result with specific error messages
   */
  private validateCredentials(obj: unknown): ValidationResult {
    const errors: string[] = [];

    // Check if object exists and is an object
    if (!obj || typeof obj !== "object") {
      errors.push("Credentials must be an object");
      return { valid: false, errors };
    }

    const creds = obj as Record<string, unknown>;

    // Validate top-level fields
    if (!("access_token" in creds)) {
      errors.push("Missing field: access_token");
    } else if (typeof creds.access_token !== "string") {
      errors.push(
        `Invalid type for access_token: expected string, got ${typeof creds.access_token}`,
      );
    }

    if (!("refresh_token" in creds)) {
      errors.push("Missing field: refresh_token");
    } else if (typeof creds.refresh_token !== "string") {
      errors.push(
        `Invalid type for refresh_token: expected string, got ${typeof creds.refresh_token}`,
      );
    }

    if (!("expires_at" in creds)) {
      errors.push("Missing field: expires_at");
    } else if (typeof creds.expires_at !== "string") {
      errors.push(
        `Invalid type for expires_at: expected string, got ${typeof creds.expires_at}`,
      );
    }

    // Validate user object
    if (!("user" in creds)) {
      errors.push("Missing field: user");
    } else if (!creds.user || typeof creds.user !== "object") {
      errors.push(
        `Invalid type for user: expected object, got ${typeof creds.user}`,
      );
    } else {
      const user = creds.user as Record<string, unknown>;

      // Validate user.id
      if (!("id" in user)) {
        errors.push("Missing field: user.id");
      } else if (typeof user.id !== "string") {
        errors.push(
          `Invalid type for user.id: expected string, got ${typeof user.id}`,
        );
      }

      // Validate user.email
      if (!("email" in user)) {
        errors.push("Missing field: user.email");
      } else if (typeof user.email !== "string") {
        errors.push(
          `Invalid type for user.email: expected string, got ${typeof user.email}`,
        );
      }

      // Validate user.tier
      if (!("tier" in user)) {
        errors.push("Missing field: user.tier");
      } else if (user.tier !== "free" && user.tier !== "paid") {
        errors.push(
          `Invalid tier value: expected 'free' or 'paid', got '${String(user.tier)}'`,
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
