import { Injectable, Logger } from "@nestjs/common";
import ky, { HTTPError, KyInstance, TimeoutError } from "ky";
import { AppConfigService } from "@/app-config.service";

/**
 * Device code response from Keycloak
 */
export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

/**
 * Token response from tunnel service
 * Enriched with user data including tier and custom slug
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    tier: "free" | "paid";
    customSlug: string | null;
  };
}

/**
 * Error response from Keycloak during device flow
 */
export interface DeviceFlowErrorResponse {
  error:
    | "authorization_pending"
    | "slow_down"
    | "expired_token"
    | "access_denied"
    | string;
  error_description?: string;
}

/**
 * Custom error class for Device Flow errors
 */
export class DeviceFlowError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly description?: string,
  ) {
    super(message);
    this.name = "DeviceFlowError";
  }
}

/**
 * Service for handling OAuth Device Flow authentication via Tunnel Service
 * Implements RFC 8628: OAuth 2.0 Device Authorization Grant
 *
 * The tunnel service proxies device flow requests to Keycloak and enriches
 * token responses with user data (tier, customSlug) from the database.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc8628
 */
@Injectable()
export class DeviceFlowService {
  private readonly client: KyInstance;
  private readonly logger = new Logger(DeviceFlowService.name);
  private readonly deviceEndpoint: string;
  private readonly tokenEndpoint: string;

  constructor(private readonly config: AppConfigService) {
    const tunnelUrl = this.config.tunnelServerUrl;
    // Remove 'wss://' or 'ws://' prefix and replace with 'https://' or 'http://'
    const httpUrl = tunnelUrl
      .replace(/^wss:/, "https:")
      .replace(/^ws:/, "http:");

    this.deviceEndpoint = `${httpUrl}/auth/device`;
    this.tokenEndpoint = `${httpUrl}/auth/token`;

    // Create ky client with configuration
    this.client = ky.create({
      timeout: 10000, // 10s for initial requests
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      retry: {
        limit: 0, // No retries for Device Flow (polling handles failures)
      },
      hooks: {
        beforeRequest: [
          (request) => {
            this.logger.debug(
              `Device Flow request: ${request.method} ${request.url}`,
            );
          },
        ],
      },
    });
  }

  /**
   * Request a device code from tunnel service
   * This initiates the Device Flow by getting a user code and verification URI
   *
   * @returns Device code response with user code and verification URL
   * @throws {DeviceFlowError} If the request fails
   *
   * @example
   * const response = await deviceFlowService.requestDeviceCode();
   * console.log(`Visit ${response.verification_uri} and enter code: ${response.user_code}`);
   */
  async requestDeviceCode(): Promise<DeviceCodeResponse> {
    try {
      this.logger.log("Requesting device code from tunnel service");

      const response = await this.client
        .post(this.deviceEndpoint, {
          body: new URLSearchParams({
            client_id: this.config.authClientId,
          }).toString(),
        })
        .json<DeviceCodeResponse>();

      this.logger.log("Device code received successfully");
      this.logger.debug(`User code: ${response.user_code}`);

      return response;
    } catch (error) {
      throw this.handleError(error, "requestDeviceCode");
    }
  }

  /**
   * Poll for token after user authorizes the device
   * Implements polling logic with exponential backoff for slow_down errors
   *
   * @param deviceCode - Device code from requestDeviceCode()
   * @param interval - Polling interval in seconds (from device code response)
   * @param expiresIn - Expiration time in seconds (from device code response)
   * @returns Token response with access and refresh tokens
   * @throws {DeviceFlowError} If token expired, access denied, or other errors
   *
   * @example
   * const deviceCode = await deviceFlowService.requestDeviceCode();
   * const tokens = await deviceFlowService.pollForToken(
   *   deviceCode.device_code,
   *   deviceCode.interval,
   *   deviceCode.expires_in
   * );
   */
  async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
  ): Promise<TokenResponse> {
    const startTime = Date.now();
    const expiresAt = startTime + expiresIn * 1000;
    let currentInterval = interval * 1000; // Convert to milliseconds

    this.logger.log("Starting token polling");
    this.logger.debug(
      `Polling interval: ${interval}s, expires in: ${expiresIn}s`,
    );

    while (Date.now() < expiresAt) {
      // Wait for the specified interval before polling
      await this.sleep(currentInterval);

      try {
        const response = await this.client
          .post(this.tokenEndpoint, {
            timeout: 5000, // 5s timeout for polling requests
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
              device_code: deviceCode,
              client_id: this.config.authClientId,
            }).toString(),
          })
          .json<TokenResponse>();

        this.logger.log("Token received successfully");
        return response;
      } catch (error) {
        // Handle expected polling errors
        if (error instanceof HTTPError) {
          try {
            const errorResponse =
              (await error.response.json()) as DeviceFlowErrorResponse;

            switch (errorResponse.error) {
              case "authorization_pending":
                // User hasn't authorized yet - continue polling
                this.logger.debug("Authorization pending, continuing poll...");
                continue;

              case "slow_down":
                // Increase polling interval by 5 seconds
                currentInterval += 5000;
                this.logger.debug(
                  `Slow down requested, new interval: ${currentInterval / 1000}s`,
                );
                continue;

              case "expired_token":
                throw new DeviceFlowError(
                  "Device code has expired. Please restart the login process.",
                  "expired_token",
                  errorResponse.error_description,
                );

              case "access_denied":
                throw new DeviceFlowError(
                  "User denied authorization.",
                  "access_denied",
                  errorResponse.error_description,
                );

              default:
                throw new DeviceFlowError(
                  `Authorization failed: ${errorResponse.error}`,
                  errorResponse.error,
                  errorResponse.error_description,
                );
            }
          } catch (parseError) {
            // If we can't parse the error response, treat it as a generic HTTP error
            if (parseError instanceof DeviceFlowError) {
              throw parseError;
            }
            throw this.handleError(error, "pollForToken");
          }
        }

        // Handle other errors (network, timeout, etc.)
        throw this.handleError(error, "pollForToken");
      }
    }

    // Polling timeout - device code expired
    throw new DeviceFlowError(
      "Polling timeout: device code expired before user authorization.",
      "expired_token",
    );
  }

  /**
   * Refresh an expired access token using a refresh token
   * This allows getting a new access token without re-authenticating
   *
   * The tunnel service enriches the response with updated user data.
   *
   * @param refreshToken - Refresh token from previous token response
   * @returns New token response with fresh access and refresh tokens, plus enriched user data
   * @throws {DeviceFlowError} If refresh fails
   *
   * @example
   * const newTokens = await deviceFlowService.refreshToken(credentials.refresh_token);
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    try {
      this.logger.log("Refreshing access token via tunnel service");

      const response = await this.client
        .post(this.tokenEndpoint, {
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: this.config.authClientId,
          }).toString(),
        })
        .json<TokenResponse>();

      this.logger.log("Token refreshed successfully");
      return response;
    } catch (error) {
      // Check if refresh token is invalid/expired
      if (error instanceof HTTPError && error.response.status === 400) {
        try {
          const errorResponse =
            (await error.response.json()) as DeviceFlowErrorResponse;
          if (errorResponse.error === "invalid_grant") {
            throw new DeviceFlowError(
              "Refresh token is invalid or expired. Please login again.",
              "invalid_grant",
              errorResponse.error_description,
            );
          }
        } catch (parseError) {
          if (parseError instanceof DeviceFlowError) {
            throw parseError;
          }
        }
      }

      throw this.handleError(error, "refreshToken");
    }
  }

  /**
   * Sleep for specified milliseconds using setTimeout
   * Used for polling intervals
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle and format errors from tunnel service requests
   * Converts various error types into DeviceFlowError with clear messages
   */
  private handleError(error: unknown, operation: string): DeviceFlowError {
    this.logger.error(`Error in ${operation}:`, error);

    // Handle HTTP errors
    if (error instanceof HTTPError) {
      const status = error.response.status;

      if (status === 401 || status === 403) {
        return new DeviceFlowError(
          "Authentication failed. Invalid client configuration.",
          "auth_failed",
        );
      }

      if (status >= 500) {
        return new DeviceFlowError(
          "Tunnel service error. Please try again later.",
          "server_error",
        );
      }

      return new DeviceFlowError(
        `HTTP error ${status}: ${error.message}`,
        "http_error",
      );
    }

    // Handle timeout errors
    if (error instanceof TimeoutError) {
      return new DeviceFlowError(
        "Request timeout. Please check your network connection.",
        "timeout",
      );
    }

    // Handle network errors (fetch failures)
    if (error instanceof Error) {
      if (
        error.message.includes("fetch") ||
        error.message.includes("network")
      ) {
        return new DeviceFlowError(
          `Cannot connect to tunnel service (${this.config.tunnelServerUrl}). Please check your internet connection.`,
          "network_error",
        );
      }
    }

    // Re-throw if already a DeviceFlowError
    if (error instanceof DeviceFlowError) {
      return error;
    }

    // Wrap unknown errors
    return new DeviceFlowError(
      `Unexpected error during ${operation}: ${error instanceof Error ? error.message : String(error)}`,
      "unknown_error",
    );
  }

  /**
   * Get the tunnel service configuration for debugging/logging
   */
  getConfig(): {
    tunnelUrl: string;
    clientId: string;
  } {
    return {
      tunnelUrl: this.config.tunnelServerUrl,
      clientId: this.config.authClientId,
    };
  }
}
