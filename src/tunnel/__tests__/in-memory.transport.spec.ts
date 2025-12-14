import { InMemoryTransport } from "../in-memory.transport";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

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
            | string
            | number;
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
      expect(transport.onmessage).toHaveBeenCalledWith(request);
    });

    it("should handle string request ids", async () => {
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        setImmediate(() => {
          // In this test, request always has an id (it's a request, not a notification)
          const requestId = ("id" in request ? request.id : 1) as
            | string
            | number;
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
            | string
            | number;
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

      // All requests should have been received
      expect(receivedRequests).toHaveLength(3);
      expect(
        receivedRequests.map((r) => ("id" in r ? r.id : undefined)),
      ).toEqual([1, 2, 3]);

      // All responses should match their request ids
      expect(responses[0]).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { requestId: 1 },
      });
      expect(responses[1]).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: { requestId: 2 },
      });
      expect(responses[2]).toEqual({
        jsonrpc: "2.0",
        id: 3,
        result: { requestId: 3 },
      });
    });

    it("should handle batch-like concurrency with Promise.all", async () => {
      transport.onmessage = jest.fn((request: JSONRPCMessage) => {
        // Respond immediately
        setImmediate(() => {
          // In this test, request always has an id (it's a request, not a notification)
          const requestId = ("id" in request ? request.id : 1) as
            | string
            | number;
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
    it("should reject after 30s timeout if no response", async () => {
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

        // Fast-forward time by 30 seconds
        jest.advanceTimersByTime(30000);

        await expect(promise).rejects.toThrow("MCP request timeout");
      } finally {
        jest.useRealTimers();
        // Need to create a fresh transport since the old one has a timeout in weird state
        await transport.close().catch(() => {});
        transport = new InMemoryTransport();
      }
    });

    it("should not timeout if response arrives before 30s", async () => {
      jest.useFakeTimers();

      try {
        transport.onmessage = jest.fn((request: JSONRPCMessage) => {
          // Respond after 25 seconds
          setTimeout(() => {
            // In this test, request always has an id (it's a request, not a notification)
            const requestId = ("id" in request ? request.id : 1) as
              | string
              | number;
            transport.send({
              jsonrpc: "2.0",
              id: requestId,
              result: { success: true },
            });
          }, 25000);
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

    it("should reject exactly at 30s boundary", async () => {
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

        // Advance to 29.9s - should not timeout
        jest.advanceTimersByTime(29900);
        await Promise.resolve();

        // Advance past 30s - should timeout
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
              | string
              | number;
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
              | string
              | number;
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
  });
});
