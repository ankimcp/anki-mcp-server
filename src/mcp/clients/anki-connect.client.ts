import { Inject, Injectable, Logger } from "@nestjs/common";
import ky, { KyInstance, HTTPError } from "ky";
import { ANKI_CONFIG } from "../config/anki-config.interface";
import type { IAnkiConfig } from "../config/anki-config.interface";
import { AnkiConnectRequest, AnkiConnectResponse } from "../types/anki.types";

/**
 * Set of AnkiConnect actions that modify collection content.
 * Used to block write operations in read-only mode.
 *
 * Only includes actions actually exposed by our tools.
 * Review/scheduling operations (answerCards, suspend, sync, etc.) are allowed.
 */
const WRITE_ACTIONS = new Set([
  // Note operations
  "addNote",
  "updateNoteFields",
  "deleteNotes",
  // Deck operations
  "createDeck",
  "changeDeck",
  // Tag operations
  "addTags",
  "removeTags",
  "clearUnusedTags",
  "replaceTags",
  // Media operations
  "storeMediaFile",
  "deleteMediaFile",
  // Model operations
  "createModel",
  "updateModelStyling",
]);

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
 * Error class for read-only mode violations
 */
export class ReadOnlyModeError extends Error {
  constructor(public readonly action: string) {
    super(
      `Action "${action}" is blocked: server is running in read-only mode. ` +
        `Write operations are disabled. Remove the --read-only flag to enable writes.`,
    );
    this.name = "ReadOnlyModeError";
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
  private readonly readOnly: boolean;
  private readonly logger = new Logger(AnkiConnectClient.name);

  constructor(@Inject(ANKI_CONFIG) private readonly config: IAnkiConfig) {
    this.apiVersion = config.ankiConnectApiVersion;
    this.apiKey = config.ankiConnectApiKey;
    this.readOnly = config.readOnly ?? false;

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
   * @throws ReadOnlyModeError if in read-only mode and action is a write operation
   */
  async invoke<T = any>(
    action: string,
    params?: Record<string, any>,
  ): Promise<T> {
    // Check for read-only mode violation
    if (this.readOnly && WRITE_ACTIONS.has(action)) {
      this.logger.warn(`Blocked write action "${action}" in read-only mode`);
      throw new ReadOnlyModeError(action);
    }

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

      const response = await this.client
        .post("", {
          json: request,
        })
        .json<AnkiConnectResponse<T>>();

      // Check for AnkiConnect errors
      if (response.error) {
        throw new AnkiConnectError(
          `AnkiConnect error: ${response.error}`,
          action,
          response.error,
        );
      }

      this.logger.log(`AnkiConnect action successful: ${action}`);
      return response.result;
    } catch (error) {
      // Re-throw ReadOnlyModeError without wrapping
      if (error instanceof ReadOnlyModeError) {
        throw error;
      }

      // Handle HTTP errors
      if (error instanceof HTTPError) {
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
