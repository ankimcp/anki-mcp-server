import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, RequestId } from "@modelcontextprotocol/sdk/types.js";
import { Logger } from "@nestjs/common";

interface PendingRequest {
  resolve: (msg: JSONRPCMessage) => void;
  reject: (err: Error) => void;
  timeout: NodeJS.Timeout;
}

export class InMemoryTransport implements Transport {
  private readonly logger = new Logger(InMemoryTransport.name);
  private pendingRequests = new Map<RequestId, PendingRequest>();
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
        pending.resolve(message);
        this.pendingRequests.delete(message.id);
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
      this.onmessage(request);
      return null;
    }

    return new Promise((resolve, reject) => {
      // Register pending request FIRST, before timeout setup or onmessage call
      // This ensures send() can find the pending request even if onmessage responds synchronously
      const pending: PendingRequest = {
        resolve,
        reject,
        timeout: null as any, // Will be set immediately below
      };
      this.pendingRequests.set(request.id as RequestId, pending);

      // Setup timeout after registering the pending request
      pending.timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id as RequestId);
        reject(new Error("MCP request timeout"));
      }, 30000);

      // Feed request to Protocol - errors are caught by Protocol
      // and sent back via send() as JSON-RPC error responses
      this.onmessage!(request);
    });
  }
}
