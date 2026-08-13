import type {
  JSONRPCMessage,
  RequestId,
  Transport,
} from "@modelcontextprotocol/server";
import { Logger } from "@nestjs/common";
import { TUNNEL_DEFAULTS } from "./tunnel.protocol";

/**
 * Prefix for transport-internal request ids.
 *
 * Load-bearing, and the reason is solely the server side: the SDK's Protocol
 * numbers server-initiated requests (ping, sampling, elicitation) from 0 and
 * pushes them through the same send() path as responses. A numeric internal
 * counter would eventually collide with one, resolving a caller's promise with
 * a request object. Caller ids are never keys here — only values on a pending
 * record — so they are not what this defends against.
 */
const INTERNAL_ID_PREFIX = "tunnel-req-";

interface PendingRequest {
  /** The caller's id, restored on the response so renumbering stays invisible. */
  originalId: RequestId;
  resolve: (msg: JSONRPCMessage) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

export class InMemoryTransport implements Transport {
  private readonly logger = new Logger(InMemoryTransport.name);
  private pendingRequests = new Map<RequestId, PendingRequest>();
  private nextInternalId = 1;
  private closed = false;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  async start(): Promise<void> {
    // No-op for in-memory transport
  }

  async close(): Promise<void> {
    this.closed = true;

    // Reject all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Transport closed"));
    }
    this.pendingRequests.clear();

    this.onclose?.();
  }

  /**
   * Called by McpServer/Protocol to send response back.
   * Resolves the pending request with matching id.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if ("id" in message && message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        // Results and errors both land here; both go back under the caller's id.
        pending.resolve({ ...message, id: pending.originalId });
      } else {
        this.logger.warn(
          `Received response for unknown request ID: ${message.id}`,
        );
      }
    }
    // Server-initiated notifications/requests are ignored in tunnel context
  }

  /**
   * Process a request and return the response.
   * For notifications (no id), returns null immediately.
   *
   * Requests are renumbered onto a transport-internal id before they reach the
   * MCP server: callers are independent MCP clients that each number their
   * requests from 1, so two in-flight requests can carry the same id and would
   * otherwise share — and overwrite — one pending entry, handing one caller the
   * other's response. The relay correlates by its own requestId, and the caller
   * only ever sees its original id restored, so the swap is invisible outside.
   */
  async handleRequest(request: JSONRPCMessage): Promise<JSONRPCMessage | null> {
    if (this.closed) {
      throw new Error("Transport is closed");
    }
    if (!this.onmessage) {
      throw new Error(
        "Transport not connected - call McpServer.connect() first",
      );
    }

    // Notifications have no id - fire and forget
    if (!("id" in request) || request.id === undefined) {
      // A relayed notifications/cancelled names the caller's id, which keys
      // nothing now, so it is dropped on purpose: no tool observes the abort
      // signal, and matching originalId is the ambiguous key this fix removed.
      this.onmessage(request);
      return null;
    }

    const originalId = request.id;
    const internalId = `${INTERNAL_ID_PREFIX}${this.nextInternalId++}`;

    return new Promise((resolve, reject) => {
      // Register pending request FIRST, before timeout setup or onmessage call
      // This ensures send() can find the pending request even if onmessage responds synchronously
      const pending: PendingRequest = {
        originalId,
        resolve,
        reject,
        timeout: null as any, // Will be set immediately below
      };
      this.pendingRequests.set(internalId, pending);

      // Setup timeout after registering the pending request
      pending.timeout = setTimeout(() => {
        // Delete only our own entry, never whatever holds the key now
        if (this.pendingRequests.get(internalId) === pending) {
          this.pendingRequests.delete(internalId);
        }
        reject(new Error("MCP request timeout"));
      }, TUNNEL_DEFAULTS.REQUEST_TIMEOUT);

      // Feed request to Protocol - errors are caught by Protocol
      // and sent back via send() as JSON-RPC error responses
      this.onmessage!({ ...request, id: internalId });
    });
  }
}
