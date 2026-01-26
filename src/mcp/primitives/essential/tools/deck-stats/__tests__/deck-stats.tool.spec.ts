import { Test, TestingModule } from "@nestjs/testing";
import { DeckStatsTool } from "../deck-stats.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import { DeckStatsResult } from "../deck-stats.types";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

describe("DeckStatsTool", () => {
  let tool: DeckStatsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeckStatsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<DeckStatsTool>(DeckStatsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("execute", () => {
    it("should return deck stats with distributions", async () => {
      // Arrange
      const deckName = "Test Deck";

      // Mock getDeckStats response
      ankiClient.invoke.mockImplementation((action: string, _params?: any) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 10,
              learn_count: 5,
              review_count: 20,
              total_in_deck: 35,
            },
          });
        }

        if (action === "findCards") {
          // Return 35 card IDs
          return Promise.resolve(Array.from({ length: 35 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          // Return ease factors (as integers, need to divide by 1000)
          // 10 new cards have 0, 5 learning have values, 20 review have values
          return Promise.resolve([
            ...Array(10).fill(0), // New cards have 0 ease
            ...Array(5).fill(2100), // Learning cards: 2.1
            ...Array(10).fill(2500), // Review cards: 2.5
            ...Array(10).fill(3000), // Review cards: 3.0
          ]);
        }

        if (action === "getIntervals") {
          // Return intervals (negative for learning, positive for review)
          return Promise.resolve([
            ...Array(10).fill(0), // New cards have 0 interval
            ...Array(5).fill(-14400), // Learning cards: negative seconds
            ...Array(10).fill(15), // Review cards: 15 days
            ...Array(10).fill(45), // Review cards: 45 days
          ]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: deckName }, mockContext);
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(4);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "getDeckStats", {
        decks: [deckName],
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "findCards", {
        query: `"deck:${deckName}"`,
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "getEaseFactors", {
        cards: expect.any(Array),
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(4, "getIntervals", {
        cards: expect.any(Array),
      });

      expect(result.deck).toBe(deckName);
      expect(result.counts).toEqual({
        total: 35,
        new: 10,
        learning: 5,
        review: 20,
      });

      // Check ease distribution (should have 25 values: 5 learning + 20 review)
      expect(result.ease.count).toBe(25);
      expect(result.ease.mean).toBeGreaterThan(0);
      expect(result.ease.buckets).toBeDefined();

      // Check interval distribution (should have 20 values: only positive review intervals)
      expect(result.intervals.count).toBe(20);
      expect(result.intervals.mean).toBeGreaterThan(0);
      expect(result.intervals.buckets).toBeDefined();

      // Progress reporting should be called
      expect(mockContext.reportProgress).toHaveBeenCalled();
    });

    it("should handle deck not found", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({}); // Empty response = deck not found
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        { deck: "NonExistent" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle empty deck (0 cards)", async () => {
      // Arrange
      const deckName = "Empty Deck";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 0,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 0,
            },
          });
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: deckName }, mockContext);
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.deck).toBe(deckName);
      expect(result.counts).toEqual({
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
      });

      // Empty distributions
      expect(result.ease.count).toBe(0);
      expect(result.ease.buckets).toBeDefined();
      expect(result.intervals.count).toBe(0);
      expect(result.intervals.buckets).toBeDefined();
    });

    it("should handle all cards are new (no ease data)", async () => {
      // Arrange
      const deckName = "New Cards Only";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 20,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 20,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve(Array.from({ length: 20 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          // All new cards have 0 ease
          return Promise.resolve(Array(20).fill(0));
        }

        if (action === "getIntervals") {
          // All new cards have 0 interval
          return Promise.resolve(Array(20).fill(0));
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: deckName }, mockContext);
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.deck).toBe(deckName);
      expect(result.counts.new).toBe(20);

      // No ease values (filtered out zeros)
      expect(result.ease.count).toBe(0);
      expect(result.intervals.count).toBe(0);
    });

    it("should use custom bucket boundaries", async () => {
      // Arrange
      const deckName = "Custom Buckets";
      const customEaseBuckets = [1.5, 2.0, 2.5];
      const customIntervalBuckets = [14, 30, 60];

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 0,
              learn_count: 0,
              review_count: 10,
              total_in_deck: 10,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve(Array.from({ length: 10 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          return Promise.resolve(Array(10).fill(2000)); // 2.0
        }

        if (action === "getIntervals") {
          return Promise.resolve(Array(10).fill(30)); // 30 days
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        {
          deck: deckName,
          ease_buckets: customEaseBuckets,
          interval_buckets: customIntervalBuckets,
        },
        mockContext,
      );
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.ease.buckets).toBeDefined();
      expect(result.intervals.buckets).toBeDefined();

      // Check that custom boundaries were used in bucket labels
      const easeBucketKeys = Object.keys(result.ease.buckets);
      expect(easeBucketKeys.some((k) => k.includes("1.5"))).toBe(true);

      const intervalBucketKeys = Object.keys(result.intervals.buckets);
      expect(intervalBucketKeys.some((k) => k.includes("14"))).toBe(true);
    });

    it("should correctly divide ease factors by 1000", async () => {
      // Arrange
      const deckName = "Ease Factor Test";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 0,
              learn_count: 0,
              review_count: 3,
              total_in_deck: 3,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve([1, 2, 3]);
        }

        if (action === "getEaseFactors") {
          // Return raw integers as AnkiConnect does
          return Promise.resolve([4100, 2500, 3000]); // Should become 4.1, 2.5, 3.0
        }

        if (action === "getIntervals") {
          return Promise.resolve([10, 20, 30]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: deckName }, mockContext);
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.ease.count).toBe(3);
      // Mean should be (4.1 + 2.5 + 3.0) / 3 ≈ 3.2
      expect(result.ease.mean).toBeCloseTo(3.2, 1);
      expect(result.ease.max).toBeCloseTo(4.1, 1);
      expect(result.ease.min).toBeCloseTo(2.5, 1);
    });

    it("should filter out negative intervals (learning cards)", async () => {
      // Arrange
      const deckName = "Mixed Intervals";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 0,
              learn_count: 5,
              review_count: 10,
              total_in_deck: 15,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve(Array.from({ length: 15 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          return Promise.resolve(Array(15).fill(2500));
        }

        if (action === "getIntervals") {
          // Mix of negative (learning) and positive (review) intervals
          return Promise.resolve([
            ...Array(5).fill(-7200), // Learning cards (negative seconds)
            ...Array(10).fill(25), // Review cards (positive days)
          ]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: deckName }, mockContext);
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      // Only positive intervals should be counted
      expect(result.intervals.count).toBe(10);
      expect(result.intervals.mean).toBe(25);
      expect(result.intervals.min).toBe(25);
    });

    it("should call reportProgress correctly", async () => {
      // Arrange
      const deckName = "Progress Test";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 0,
              learn_count: 0,
              review_count: 5,
              total_in_deck: 5,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve([1, 2, 3, 4, 5]);
        }

        if (action === "getEaseFactors") {
          return Promise.resolve(Array(5).fill(2500));
        }

        if (action === "getIntervals") {
          return Promise.resolve(Array(5).fill(10));
        }

        return Promise.resolve({});
      });

      // Act
      await tool.execute({ deck: deckName }, mockContext);

      // Assert - should be called multiple times with increasing progress
      expect(mockContext.reportProgress).toHaveBeenCalled();
      const calls = mockContext.reportProgress.mock.calls;
      expect(calls.length).toBeGreaterThan(1);

      // First call should be 10%
      expect(calls[0][0]).toEqual({ progress: 10, total: 100 });

      // Last call should be 100%
      expect(calls[calls.length - 1][0]).toEqual({ progress: 100, total: 100 });
    });

    it("should handle AnkiConnect errors gracefully", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(
        new Error("AnkiConnect: collection is not available"),
      );

      // Act
      const rawResult = await tool.execute({ deck: "Test" }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("collection is not available");
    });

    it("should handle findCards returning empty array", async () => {
      // Arrange
      const deckName = "Mismatch Deck";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "getDeckStats") {
          return Promise.resolve({
            "1234567890": {
              deck_id: 1234567890,
              name: deckName,
              new_count: 5,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 5,
            },
          });
        }

        if (action === "findCards") {
          // findCards returns empty even though getDeckStats shows cards
          return Promise.resolve([]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: deckName }, mockContext);
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert - should still return counts from getDeckStats
      expect(result.deck).toBe(deckName);
      expect(result.counts.total).toBe(5);
      expect(result.ease.count).toBe(0);
      expect(result.intervals.count).toBe(0);
    });
  });
});
