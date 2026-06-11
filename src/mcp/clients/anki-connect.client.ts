import { Inject, Injectable, Logger } from "@nestjs/common";
import { Mutex } from "async-mutex";
import ky, { KyInstance, HTTPError } from "ky";
import { ANKI_CONFIG } from "../config/anki-config.interface";
import type { IAnkiConfig } from "../config/anki-config.interface";
import { AnkiConnectRequest, AnkiConnectResponse } from "../types/anki.types";

/**
 * AnkiConnect is single-threaded (requests run on Anki's Qt main thread with
 * max_workers=1), so concurrent POSTs collide and time out. All requests —
 * reads included — are serialized through this mutex (concurrency 1, FIFO).
 *
 * Module-scoped on purpose: AnkiConnectClient is provided by both the
 * essential and GUI modules, so NestJS may create multiple instances. A
 * single file-level mutex serializes across all of them, matching the
 * "one Anki per process" invariant.
 */
const ankiRequestMutex = new Mutex();

/**
 * Maximum number of requests allowed to be pending (in-flight + queued) at
 * once. Beyond this we fail fast instead of queueing unbounded work — the
 * error message steers the AI toward the addNotes batch tool, which awaits
 * sequentially and keeps queue depth ~1.
 */
const MAX_QUEUE_DEPTH = 50;

/** Current number of pending requests (in-flight + waiting on the mutex). */
let pendingRequests = 0;

/**
 * @internal test-only — resets the module-scoped pending-request counter so
 * serialization specs don't leak queue depth across tests (a wedged counter
 * would otherwise trip the backpressure guard in later tests). The mutex
 * itself auto-frees once every in-flight `runExclusive` callback settles, so
 * only the counter needs an explicit reset. Not part of the public API.
 */
export function __resetAnkiQueueForTests(): void {
  pendingRequests = 0;
}

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
  "updateModelTemplates",
  "modelFieldAdd",
  "modelFieldRemove",
  "modelFieldRename",
  "modelFieldReposition",
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
      prefix: config.ankiConnectUrl,
      timeout: config.ankiConnectTimeout,
      headers: {
        "Content-Type": "application/json",
      },
      // Note: timeouts are intentionally NOT retried (no retryOnTimeout), so
      // the time a request can hold the serialization mutex stays bounded by
      // ankiConnectTimeout (plus the listed retryable HTTP statuses).
      retry: {
        limit: 2,
        methods: ["POST"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 3000,
      },
      hooks: {
        beforeRequest: [
          ({ request }) => {
            this.logger.debug(
              `AnkiConnect request: ${request.method} ${request.url}`,
            );
          },
        ],
        afterResponse: [
          ({ response }) => {
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

    // Backpressure guard: fail fast instead of queueing unbounded work.
    if (pendingRequests >= MAX_QUEUE_DEPTH) {
      this.logger.warn(
        `Rejecting action "${action}": ${pendingRequests} requests already pending (max ${MAX_QUEUE_DEPTH})`,
      );
      throw new AnkiConnectError(
        `Too many concurrent requests queued for AnkiConnect (max ${MAX_QUEUE_DEPTH}). ` +
          `For bulk note creation, use the addNotes batch tool instead of many parallel addNote calls.`,
        action,
      );
    }

    // Enqueue synchronously (no await between here and runExclusive) so FIFO
    // order matches submission order.
    pendingRequests++;

    try {
      // Acquire the mutex BEFORE dispatching, so ky's timeout (which starts
      // at POST dispatch) covers only the in-flight request, never the time
      // spent waiting in the queue. runExclusive releases the lock even if
      // the callback throws.
      const result = await ankiRequestMutex.runExclusive(async () => {
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

        // Log success while still holding the mutex so the per-request log
        // order ("Invoking" → "successful") can't interleave with the next
        // request's "Invoking" line.
        this.logger.log(`AnkiConnect action successful: ${action}`);
        return response.result;
      });

      return result;
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
    } finally {
      pendingRequests--;
    }
  }
}
