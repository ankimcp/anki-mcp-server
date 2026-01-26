import { Inject, Injectable, Logger } from "@nestjs/common";
import ky, { KyInstance, HTTPError } from "ky";
import { ANKI_CONFIG } from "../config/anki-config.interface";
import type { IAnkiConfig } from "../config/anki-config.interface";
import { AnkiConnectRequest, AnkiConnectResponse } from "../types/anki.types";

/**
 * Error class for AnkiConnect-specific errors
 */
export class AnkiConnectError extends Error {
  constructor(
    message: string,
    public readonly action?: string,
    public readonly originalError?: string,
  ) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

/**
 * AnkiConnect client for communication with Anki via AnkiConnect plugin
 */
@Injectable()
export class AnkiConnectClient {
  private readonly client: KyInstance;
  private readonly apiVersion: number;
  private readonly apiKey?: string;
  private readonly logger = new Logger(AnkiConnectClient.name);

  constructor(@Inject(ANKI_CONFIG) private readonly config: IAnkiConfig) {
    this.apiVersion = config.ankiConnectApiVersion;
    this.apiKey = config.ankiConnectApiKey;

    // Create ky client with configuration
    this.client = ky.create({
      prefixUrl: config.ankiConnectUrl,
      timeout: config.ankiConnectTimeout,
      headers: {
        "Content-Type": "application/json",
      },
      retry: {
        limit: 2,
        methods: ["POST"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 3000,
      },
      hooks: {
        beforeRequest: [
          (request) => {
            this.logger.debug(
              `AnkiConnect request: ${request.method} ${request.url}`,
            );
          },
        ],
        afterResponse: [
          (_request, _options, response) => {
            this.logger.debug(
              `AnkiConnect response: ${response.status} ${response.statusText}`,
            );
          },
        ],
      },
    });
  }

  /**
   * Send a request to AnkiConnect
   * @param action - The AnkiConnect action to perform
   * @param params - Parameters for the action
   * @returns The result from AnkiConnect
   */
  async invoke<T = any>(
    action: string,
    params?: Record<string, any>,
  ): Promise<T> {
    const request: AnkiConnectRequest = {
      action,
      version: this.apiVersion,
      params,
    };

    // Add API key if configured
    if (this.apiKey) {
      request.key = this.apiKey;
    }

    try {
      this.logger.log(`Invoking AnkiConnect action: ${action}`);
      
      // Log to stderr for MCP stdio visibility
      console.error(`[AnkiConnectClient] ===== REQUEST =====`);
      console.error(`[AnkiConnectClient] Action: ${action}`);
      console.error(`[AnkiConnectClient] Params: ${JSON.stringify(params, null, 2)}`);
      console.error(`[AnkiConnectClient] Full request body: ${JSON.stringify(request, null, 2)}`);
      console.error(`[AnkiConnectClient] URL: ${this.config.ankiConnectUrl}`);

      const response = await this.client
        .post("", {
          json: request,
        })
        .json<AnkiConnectResponse<T>>();

      // Log response to stderr
      console.error(`[AnkiConnectClient] ===== RESPONSE =====`);
      console.error(`[AnkiConnectClient] Response: ${JSON.stringify(response, null, 2)}`);
      console.error(`[AnkiConnectClient] Result type: ${typeof response.result}`);
      console.error(`[AnkiConnectClient] Result is array: ${Array.isArray(response.result)}`);
      if (Array.isArray(response.result)) {
        console.error(`[AnkiConnectClient] Result array length: ${response.result.length}`);
      }

      // Check for AnkiConnect errors
      if (response.error) {
        console.error(`[AnkiConnectClient] ⚠️  AnkiConnect returned error: ${response.error}`);
        throw new AnkiConnectError(
          `AnkiConnect error: ${response.error}`,
          action,
          response.error,
        );
      }

      this.logger.log(`AnkiConnect action successful: ${action}`);
      console.error(`[AnkiConnectClient] ===== SUCCESS =====`);
      return response.result;
    } catch (error) {
      // Log error to stderr
      console.error(`[AnkiConnectClient] ===== ERROR =====`);
      console.error(`[AnkiConnectClient] Action that failed: ${action}`);
      console.error(`[AnkiConnectClient] Error type: ${error?.constructor?.name}`);
      console.error(`[AnkiConnectClient] Error message: ${error instanceof Error ? error.message : String(error)}`);
      
      // Handle HTTP errors
      if (error instanceof HTTPError) {
        console.error(`[AnkiConnectClient] HTTP Status: ${error.response.status}`);
        if (error.response.status === 403) {
          throw new AnkiConnectError(
            "Permission denied. Please check AnkiConnect configuration and API key.",
            action,
          );
        }
        throw new AnkiConnectError(
          `HTTP error ${error.response.status}: ${error.message}`,
          action,
        );
      }

      // Handle connection errors
      if (error instanceof Error && error.message.includes("fetch")) {
        console.error(`[AnkiConnectClient] Connection error - Anki may not be running`);
        throw new AnkiConnectError(
          "Cannot connect to Anki. Please ensure Anki is running and AnkiConnect plugin is installed.",
          action,
        );
      }

      // Re-throw AnkiConnect errors
      if (error instanceof AnkiConnectError) {
        throw error;
      }

      // Wrap unknown errors
      throw new AnkiConnectError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
        action,
      );
    }
  }
}
