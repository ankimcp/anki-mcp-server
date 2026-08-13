import { InMemoryTransport } from "../in-memory.transport";
import type { JSONRPCMessage, RequestId } from "@modelcontextprotocol/server";

const idOf = (message: JSONRPCMessage): RequestId | undefined =>
  "id" in message ? (message.id as RequestId | undefined) : undefined;

describe("InMemoryTransport", () => {
  let transport: InMemoryTransport;

  beforeEach(() => {
    // Ensure we start with real timers
    jest.useRealTimers();
    transport = new InMemoryTransport();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    // Ensure real timers are restored before cleanup
    jest.useRealTimers();

    if (transport) {
      await transport.close();
    }
  });

  describe("start", () => {
    it("should be a no-op for in-memory transport", async () => {
      await expect(transport.start()).resolves.toBeUndefined();
    });
  });

  describe("basic request/response", () => {
    it("should resolve with response when send() is called with matching id", async () => {
      // Setup onmessage handler that immediately sends response
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        // Simulate server processing and sending response
        setImmediate(() => {
          // In this test, request always has an id (it's a request, not a notification)
          const requestId = ("id" in request ? request.id : 1) as
            string | number;
          transport.send({
            jsonrpc: "2.0",
            id: requestId,
            result: { success: true },
          });
        });
      });

      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: {},
      };

      const response = await transport.handleRequest(request);

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      });

      // Dispatched under an internal id; everything else is untouched
      const dispatched = (transport.onmessage as jest.Mock).mock
        .calls[0][0] as JSONRPCMessage;
      expect(idOf(dispatched)).not.toBe(1);
      expect({ ...dispatched, id: 1 }).toEqual(request);
    });

    it("should handle string request ids", async () => {
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        setImmediate(() => {
          // In this test, request always has an id (it's a request, not a notification)
          const requestId = ("id" in request ? request.id : 1) as
            string | number;
          transport.send({
            jsonrpc: "2.0",
            id: requestId,
            result: { data: "test" },
          });
        });
      });

      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: "request-uuid-123",
        method: "test/method",
        params: {},
      };

      const response = await transport.handleRequest(request);

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: "request-uuid-123",
        result: { data: "test" },
      });
    });
  });

  describe("concurrent requests", () => {
    it("should handle multiple pending requests in parallel", async () => {
      // Track received requests
      const receivedRequests: JSONRPCMessage[] = [];

      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        receivedRequests.push(request);

        // Respond with delay to ensure concurrency
        setTimeout(() => {
          // In this test, request always has an id (it's a request, not a notification)
          const requestId = ("id" in request ? request.id : 1) as
            string | number;
          transport.send({
            jsonrpc: "2.0",
            id: requestId,
            result: { requestId },
          });
        }, 10);
      });

      // Send 3 requests concurrently
      const promises = [
        transport.handleRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "test/method1",
          params: {},
        }),
        transport.handleRequest({
          jsonrpc: "2.0",
          id: 2,
          method: "test/method2",
          params: {},
        }),
        transport.handleRequest({
          jsonrpc: "2.0",
          id: 3,
          method: "test/method3",
          params: {},
        }),
      ];

      const responses = await Promise.all(promises);

      // All requests should have been received, each under its own internal id
      expect(receivedRequests).toHaveLength(3);
      const dispatchedIds = receivedRequests.map(idOf);
      expect(new Set(dispatchedIds).size).toBe(3);
      expect(dispatchedIds).not.toContain(1);

      // All responses should come back under the caller's own id
      expect(responses[0]).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { requestId: dispatchedIds[0] },
      });
      expect(responses[1]).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: { requestId: dispatchedIds[1] },
      });
      expect(responses[2]).toEqual({
        jsonrpc: "2.0",
        id: 3,
        result: { requestId: dispatchedIds[2] },
      });
    });

    it("should handle batch-like concurrency with Promise.all", async () => {
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        // Respond immediately
        setImmediate(() => {
          // In this test, request always has an id (it's a request, not a notification)
          const requestId = ("id" in request ? request.id : 1) as
            string | number;
          transport.send({
            jsonrpc: "2.0",
            id: requestId,
            result: { method: (request as any).method },
          });
        });
      });

      const requests = Array.from({ length: 10 }, (_, i) => ({
        jsonrpc: "2.0" as const,
        id: i + 1,
        method: `test/method${i}`,
        params: {},
      }));

      const responses = await Promise.all(
        requests.map((req) => transport.handleRequest(req)),
      );

      // All responses should be present
      expect(responses).toHaveLength(10);

      // Each response should match its request
      responses.forEach((response, i) => {
        expect(response).toEqual({
          jsonrpc: "2.0",
          id: i + 1,
          result: { method: `test/method${i}` },
        });
      });
    });
  });

  describe("request id isolation", () => {
    it("should not cross-deliver responses when two callers share an id", async () => {
      // Two independent MCP clients both number their first request `id: 1`.
      // Caller A is first in and answered first, which is what displaced the
      // pending entry back when the map was keyed by the caller's id.
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        const caller = (request as { params?: { caller?: string } }).params
          ?.caller;
        setTimeout(
          () => {
            transport.send({
              jsonrpc: "2.0",
              id: idOf(request) as RequestId,
              result: { secret: `${caller}-PRIVATE` },
            });
          },
          caller === "A" ? 0 : 20,
        );
      });

      const callerA = transport.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: { caller: "A" },
      });
      const callerB = transport.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: { caller: "B" },
      });

      // B is awaited first on purpose: under id-keyed correlation it settles
      // early with A's payload, so the leak shows up as a failed assertion
      // rather than as A hanging until the request timeout.
      await expect(callerB).resolves.toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { secret: "B-PRIVATE" },
      });
      await expect(callerA).resolves.toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { secret: "A-PRIVATE" },
      });
    });

    it("should allocate a distinct internal id per request with the same caller id", async () => {
      const dispatched: JSONRPCMessage[] = [];
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        dispatched.push(request);
      });

      const pending = [
        transport.handleRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "test/method",
          params: {},
        }),
        transport.handleRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "test/method",
          params: {},
        }),
      ].map((promise) => promise.catch(() => {}));

      expect(idOf(dispatched[0])).not.toEqual(idOf(dispatched[1]));

      await transport.close();
      await Promise.all(pending);
    });

    it("should pass a notification through untouched while a request with the same id is pending", async () => {
      const dispatched: JSONRPCMessage[] = [];
      transport.onmessage = jest.fn((message: JSONRPCMessage) => {
        dispatched.push(message);
      });

      const pending = transport.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: {},
      });

      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: 1 },
      };

      await expect(transport.handleRequest(notification)).resolves.toBeNull();
      expect(dispatched[1]).toBe(notification);

      // The pending request is untouched by the notification
      await transport.send({
        jsonrpc: "2.0",
        id: idOf(dispatched[0]) as RequestId,
        result: { success: true },
      });
      await expect(pending).resolves.toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { success: true },
      });
    });

    it("should restore the original id on error responses", async () => {
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        setImmediate(() => {
          transport.send({
            jsonrpc: "2.0",
            id: idOf(request) as RequestId,
            error: { code: -32601, message: "Method not found" },
          });
        });
      });

      const response = await transport.handleRequest({
        jsonrpc: "2.0",
        id: "caller-uuid",
        method: "test/missing",
        params: {},
      });

      expect(response).toEqual({
        jsonrpc: "2.0",
        id: "caller-uuid",
        error: { code: -32601, message: "Method not found" },
      });
    });

    it("should not let a timing-out request evict a later request with the same id", async () => {
      jest.useFakeTimers();

      try {
        const dispatched: JSONRPCMessage[] = [];
        transport.onmessage = jest.fn((request: JSONRPCMessage) => {
          dispatched.push(request);
        });

        const stale = transport.handleRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "test/slow",
          params: {},
        });
        const staleRejection = expect(stale).rejects.toThrow(
          "MCP request timeout",
        );

        // A client reconnects and starts numbering from 1 again, just before
        // the orphaned request hits its timeout
        jest.advanceTimersByTime(24900);
        const fresh = transport.handleRequest({
          jsonrpc: "2.0",
          id: 1,
          method: "test/fast",
          params: {},
        });

        jest.advanceTimersByTime(200);
        await staleRejection;

        await transport.send({
          jsonrpc: "2.0",
          id: idOf(dispatched[1]) as RequestId,
          result: { success: true },
        });

        await expect(fresh).resolves.toEqual({
          jsonrpc: "2.0",
          id: 1,
          result: { success: true },
        });
      } finally {
        jest.useRealTimers();
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });
  });

  describe("notifications", () => {
    it("should return null immediately for notification without id", async () => {
      const onmessageSpy = jest.fn();
      transport.onmessage = onmessageSpy;

      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notification/test",
        params: { data: "test" },
      };

      const result = await transport.handleRequest(notification);

      expect(result).toBeNull();
      expect(onmessageSpy).toHaveBeenCalledWith(notification);
    });

    it("should return null for notification with explicit undefined id", async () => {
      const onmessageSpy = jest.fn();
      transport.onmessage = onmessageSpy;

      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: undefined,
        method: "notification/test",
        params: {},
      };

      const result = await transport.handleRequest(notification);

      expect(result).toBeNull();
      expect(onmessageSpy).toHaveBeenCalledWith(notification);
    });

    it("should not wait for response on notifications", async () => {
      let callbackInvoked = false;

      transport.onmessage = jest.fn(() => {
        callbackInvoked = true;
      });

      const notification: JSONRPCMessage = {
        jsonrpc: "2.0",
        method: "notification/test",
        params: {},
      };

      const result = await transport.handleRequest(notification);

      expect(result).toBeNull();
      expect(callbackInvoked).toBe(true);
    });
  });

  describe("timeout", () => {
    it("should reject after the 25s timeout if no response", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn(); // Don't send response

        const request: JSONRPCMessage = {
          jsonrpc: "2.0",
          id: 1,
          method: "test/method",
          params: {},
        };

        const promise = transport.handleRequest(request);

        // Fast-forward past the 25s timeout
        jest.advanceTimersByTime(25000);

        await expect(promise).rejects.toThrow("MCP request timeout");
      } finally {
        jest.useRealTimers();
        // Need to create a fresh transport since the old one has a timeout in weird state
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });

    it("should not timeout if response arrives before the 25s timeout", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn((request: JSONRPCMessage) => {
          // Respond after 20 seconds — before the 25s timeout
          setTimeout(() => {
            // In this test, request always has an id (it's a request, not a notification)
            const requestId = ("id" in request ? request.id : 1) as
              string | number;
            transport.send({
              jsonrpc: "2.0",
              id: requestId,
              result: { success: true },
            });
          }, 20000);
        });

        const request: JSONRPCMessage = {
          jsonrpc: "2.0",
          id: 1,
          method: "test/method",
          params: {},
        };

        const promise = transport.handleRequest(request);

        // Fast-forward time by 25 seconds (response arrives)
        jest.advanceTimersByTime(25000);

        const response = await promise;

        expect(response).toEqual({
          jsonrpc: "2.0",
          id: 1,
          result: { success: true },
        });
      } finally {
        jest.useRealTimers();
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });

    it("should reject exactly at the 25s boundary", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn();

        const request: JSONRPCMessage = {
          jsonrpc: "2.0",
          id: 1,
          method: "test/method",
          params: {},
        };

        const promise = transport.handleRequest(request);

        // Advance to 24.9s - should not timeout
        jest.advanceTimersByTime(24900);
        await Promise.resolve();

        // Advance past 25s - should timeout
        jest.advanceTimersByTime(100);

        await expect(promise).rejects.toThrow("MCP request timeout");
      } finally {
        jest.useRealTimers();
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });
  });

  describe("timeout cleanup", () => {
    it("should clear timeout on successful response", async () => {
      jest.useFakeTimers();

      try {
        const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

        transport.onmessage = jest.fn((request: JSONRPCMessage) => {
          setImmediate(() => {
            // In this test, request always has an id (it's a request, not a notification)
            const requestId = ("id" in request ? request.id : 1) as
              string | number;
            transport.send({
              jsonrpc: "2.0",
              id: requestId,
              result: { success: true },
            });
          });
        });

        const request: JSONRPCMessage = {
          jsonrpc: "2.0",
          id: 1,
          method: "test/method",
          params: {},
        };

        const promise = transport.handleRequest(request);
        jest.runAllTimers();

        await promise;

        // Timeout should have been cleared
        expect(clearTimeoutSpy).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });

    it("should not leak timers on multiple sequential requests", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn((request: JSONRPCMessage) => {
          setImmediate(() => {
            // In this test, request always has an id (it's a request, not a notification)
            const requestId = ("id" in request ? request.id : 1) as
              string | number;
            transport.send({
              jsonrpc: "2.0",
              id: requestId,
              result: { success: true },
            });
          });
        });

        // Send 3 requests sequentially
        for (let i = 1; i <= 3; i++) {
          const promise = transport.handleRequest({
            jsonrpc: "2.0",
            id: i,
            method: "test/method",
            params: {},
          });

          jest.runAllTimers();
          await promise;
        }

        // Verify no pending timers
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });
  });

  describe("transport closed", () => {
    it("should throw if handleRequest called after close", async () => {
      transport.onmessage = jest.fn();

      await transport.close();

      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: {},
      };

      await expect(transport.handleRequest(request)).rejects.toThrow(
        "Transport is closed",
      );
    });

    it("should not invoke onmessage if transport is closed", async () => {
      const onmessageSpy = jest.fn();
      transport.onmessage = onmessageSpy;

      await transport.close();

      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: {},
      };

      await expect(transport.handleRequest(request)).rejects.toThrow();
      expect(onmessageSpy).not.toHaveBeenCalled();
    });
  });

  describe("not connected", () => {
    it("should throw if onmessage is not set", async () => {
      // Don't set onmessage

      const request: JSONRPCMessage = {
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: {},
      };

      await expect(transport.handleRequest(request)).rejects.toThrow(
        "Transport not connected - call McpServer.connect() first",
      );
    });
  });

  describe("close() cleanup", () => {
    it("should reject all pending requests when close() is called", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn(); // Don't send responses

        // Start 3 pending requests
        const promises = [
          transport.handleRequest({
            jsonrpc: "2.0",
            id: 1,
            method: "test/method1",
            params: {},
          }),
          transport.handleRequest({
            jsonrpc: "2.0",
            id: 2,
            method: "test/method2",
            params: {},
          }),
          transport.handleRequest({
            jsonrpc: "2.0",
            id: 3,
            method: "test/method3",
            params: {},
          }),
        ];

        // Close the transport
        await transport.close();

        // All pending requests should be rejected
        await expect(promises[0]).rejects.toThrow("Transport closed");
        await expect(promises[1]).rejects.toThrow("Transport closed");
        await expect(promises[2]).rejects.toThrow("Transport closed");
      } finally {
        jest.useRealTimers();
        transport = new InMemoryTransport();
      }
    });

    it("should clear all timeouts on close", async () => {
      jest.useFakeTimers();

      try {
        const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");

        transport.onmessage = jest.fn();

        // Start 3 pending requests
        const promises = [
          transport
            .handleRequest({
              jsonrpc: "2.0",
              id: 1,
              method: "test/method1",
              params: {},
            })
            .catch(() => {}),
          transport
            .handleRequest({
              jsonrpc: "2.0",
              id: 2,
              method: "test/method2",
              params: {},
            })
            .catch(() => {}),
          transport
            .handleRequest({
              jsonrpc: "2.0",
              id: 3,
              method: "test/method3",
              params: {},
            })
            .catch(() => {}),
        ];

        // Clear spy call count from request creation
        clearTimeoutSpy.mockClear();

        // Close the transport
        await transport.close();

        // Wait for all rejections to complete
        await Promise.all(promises);

        // clearTimeout should have been called for each pending request
        expect(clearTimeoutSpy).toHaveBeenCalledTimes(3);
      } finally {
        jest.useRealTimers();
        transport = new InMemoryTransport();
      }
    });

    it("should invoke onclose callback", async () => {
      jest.useFakeTimers();

      try {
        const oncloseSpy = jest.fn();
        transport.onclose = oncloseSpy;

        await transport.close();

        expect(oncloseSpy).toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        transport = new InMemoryTransport();
      }
    });

    it("should clear pendingRequests map", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn();

        // Start a request
        const promise = transport
          .handleRequest({
            jsonrpc: "2.0",
            id: 1,
            method: "test/method",
            params: {},
          })
          .catch(() => {});

        await transport.close();
        await promise;

        // Try to send a response after close (should be ignored)
        await transport.send({
          jsonrpc: "2.0",
          id: 1,
          result: { success: true },
        });

        // No error should be thrown, and map should be clear
        expect(promise).resolves.toBeUndefined();
      } finally {
        jest.useRealTimers();
        transport = new InMemoryTransport();
      }
    });
  });

  describe("edge cases", () => {
    it("should ignore send() calls for unknown request ids", async () => {
      // Send response for non-existent request
      await expect(
        transport.send({
          jsonrpc: "2.0",
          id: 999,
          result: { success: true },
        }),
      ).resolves.toBeUndefined();
    });

    it("should ignore send() calls without id (server notifications)", async () => {
      await expect(
        transport.send({
          jsonrpc: "2.0",
          method: "server/notification",
          params: {},
        }),
      ).resolves.toBeUndefined();
    });

    it("should leave a caller pending when a server-initiated request reuses its id", async () => {
      transport.onmessage = jest.fn();

      const pending = transport.handleRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "test/method",
        params: {},
      });

      // The SDK numbers server-initiated requests from 0, so a numeric internal
      // counter would let this one match the caller's pending entry and hand the
      // caller a *request* object as its response.
      await transport.send({
        jsonrpc: "2.0",
        id: 1,
        method: "sampling/createMessage",
        params: {},
      });

      // Drained first so the race is decided by settlement rather than by task
      // ordering: an already-settled promise wins by array order, so only a
      // caller still in flight lets the sentinel through.
      await new Promise((resolve) => setImmediate(resolve));
      const unsettled = Symbol("unsettled");
      await expect(
        Promise.race([pending, Promise.resolve(unsettled)]),
      ).resolves.toBe(unsettled);

      const rejection = expect(pending).rejects.toThrow("Transport closed");
      await transport.close();
      await rejection;
    });
  });
});
