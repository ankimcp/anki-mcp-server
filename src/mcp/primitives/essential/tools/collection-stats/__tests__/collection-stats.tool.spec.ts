import { Test, TestingModule } from "@nestjs/testing";
import { CollectionStatsTool } from "../collection-stats.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import { CollectionStatsResult } from "../collection-stats.types";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

describe("CollectionStatsTool", () => {
  let tool: CollectionStatsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CollectionStatsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<CollectionStatsTool>(CollectionStatsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("execute", () => {
    it("should return collection stats with multiple decks", async () => {
      // Arrange
      const deckNames = ["Deck A", "Deck B", "Deck C"];

      ankiClient.invoke.mockImplementation((action: string, _params?: any) => {
        if (action === "deckNames") {
          return Promise.resolve(deckNames);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Deck A",
              new_count: 10,
              learn_count: 5,
              review_count: 20,
              total_in_deck: 35,
            },
            "2": {
              deck_id: 2,
              name: "Deck B",
              new_count: 15,
              learn_count: 3,
              review_count: 30,
              total_in_deck: 48,
            },
            "3": {
              deck_id: 3,
              name: "Deck C",
              new_count: 5,
              learn_count: 2,
              review_count: 10,
              total_in_deck: 17,
            },
          });
        }

        if (action === "findCards") {
          // Total: 35 + 48 + 17 = 100 cards
          return Promise.resolve(Array.from({ length: 100 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          // Mix of new cards (0 ease) and cards with ease
          return Promise.resolve([
            ...Array(30).fill(0), // 30 new cards
            ...Array(70).fill(2500), // 70 cards with ease
          ]);
        }

        if (action === "getIntervals") {
          // Mix of learning (negative) and review (positive) intervals
          return Promise.resolve([
            ...Array(30).fill(0), // New cards
            ...Array(10).fill(-7200), // Learning cards
            ...Array(60).fill(30), // Review cards
          ]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(5);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "deckNames");
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "getDeckStats", {
        decks: deckNames,
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "findCards", {
        query: "deck:*",
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(4, "getEaseFactors", {
        cards: expect.any(Array),
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(5, "getIntervals", {
        cards: expect.any(Array),
      });

      // Check aggregated counts
      expect(result.total_decks).toBe(3);
      expect(result.counts).toEqual({
        total: 100, // 35 + 48 + 17
        new: 30, // 10 + 15 + 5
        learning: 10, // 5 + 3 + 2
        review: 60, // 20 + 30 + 10
      });

      // Check distributions
      expect(result.ease.count).toBe(70); // Filtered out zeros
      expect(result.intervals.count).toBe(60); // Only positive intervals

      // Check per-deck breakdown
      expect(result.per_deck).toHaveLength(3);
      expect(result.per_deck[0]).toEqual({
        deck: "Deck A",
        total: 35,
        new: 10,
        learning: 5,
        review: 20,
      });

      // Progress reporting should be called
      expect(mockContext.reportProgress).toHaveBeenCalled();
    });

    it("should handle no decks in collection", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve([]);
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert
      expect(result.total_decks).toBe(0);
      expect(result.counts).toEqual({
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
      });
      expect(result.ease.count).toBe(0);
      expect(result.intervals.count).toBe(0);
      expect(result.per_deck).toEqual([]);

      // Should only call deckNames
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).toHaveBeenCalledWith("deckNames");
    });

    it("should handle some decks being empty", async () => {
      // Arrange
      const deckNames = ["Full Deck", "Empty Deck"];

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(deckNames);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Full Deck",
              new_count: 10,
              learn_count: 5,
              review_count: 15,
              total_in_deck: 30,
            },
            "2": {
              deck_id: 2,
              name: "Empty Deck",
              new_count: 0,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 0,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve(Array.from({ length: 30 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          return Promise.resolve(Array(30).fill(2500));
        }

        if (action === "getIntervals") {
          return Promise.resolve(Array(30).fill(20));
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert
      expect(result.total_decks).toBe(2);
      expect(result.counts.total).toBe(30);

      // Check per-deck breakdown includes empty deck
      expect(result.per_deck).toHaveLength(2);
      const emptyDeck = result.per_deck.find((d) => d.deck === "Empty Deck");
      expect(emptyDeck).toEqual({
        deck: "Empty Deck",
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
      });
    });

    it("should correctly aggregate per-deck statistics", async () => {
      // Arrange
      const deckNames = ["Math", "Science"];

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(deckNames);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Math",
              new_count: 12,
              learn_count: 8,
              review_count: 25,
              total_in_deck: 45,
            },
            "2": {
              deck_id: 2,
              name: "Science",
              new_count: 18,
              learn_count: 3,
              review_count: 35,
              total_in_deck: 56,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve(Array.from({ length: 101 }, (_, i) => i + 1));
        }

        if (action === "getEaseFactors") {
          return Promise.resolve(Array(101).fill(2500));
        }

        if (action === "getIntervals") {
          return Promise.resolve(Array(101).fill(25));
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert - verify aggregation is accurate
      expect(result.counts).toEqual({
        total: 101, // 45 + 56
        new: 30, // 12 + 18
        learning: 11, // 8 + 3
        review: 60, // 25 + 35
      });

      // Verify per-deck matches individual decks
      const mathDeck = result.per_deck.find((d) => d.deck === "Math");
      expect(mathDeck).toEqual({
        deck: "Math",
        total: 45,
        new: 12,
        learning: 8,
        review: 25,
      });

      const scienceDeck = result.per_deck.find((d) => d.deck === "Science");
      expect(scienceDeck).toEqual({
        deck: "Science",
        total: 56,
        new: 18,
        learning: 3,
        review: 35,
      });
    });

    it("should use custom bucket boundaries", async () => {
      // Arrange
      const customEaseBuckets = [1.8, 2.2, 2.8];
      const customIntervalBuckets = [10, 30, 60];

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(["Test Deck"]);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Test Deck",
              new_count: 0,
              learn_count: 0,
              review_count: 10,
              total_in_deck: 10,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        }

        if (action === "getEaseFactors") {
          return Promise.resolve(Array(10).fill(2500));
        }

        if (action === "getIntervals") {
          return Promise.resolve(Array(10).fill(25));
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        {
          ease_buckets: customEaseBuckets,
          interval_buckets: customIntervalBuckets,
        },
        mockContext,
      );
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert - check that custom boundaries were used
      const easeBucketKeys = Object.keys(result.ease.buckets);
      expect(easeBucketKeys.some((k) => k.includes("1.8"))).toBe(true);
      expect(easeBucketKeys.some((k) => k.includes("2.2"))).toBe(true);

      const intervalBucketKeys = Object.keys(result.intervals.buckets);
      expect(intervalBucketKeys.some((k) => k.includes("10"))).toBe(true);
      expect(intervalBucketKeys.some((k) => k.includes("30"))).toBe(true);
    });

    it("should handle empty collection (decks exist but no cards)", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(["Empty Deck 1", "Empty Deck 2"]);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Empty Deck 1",
              new_count: 0,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 0,
            },
            "2": {
              deck_id: 2,
              name: "Empty Deck 2",
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
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert
      expect(result.total_decks).toBe(2);
      expect(result.counts).toEqual({
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
      });
      expect(result.ease.count).toBe(0);
      expect(result.intervals.count).toBe(0);
      expect(result.per_deck).toHaveLength(2);

      // Should not call findCards, getEaseFactors, or getIntervals
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2); // Only deckNames and getDeckStats
    });

    it("should correctly divide ease factors by 1000", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(["Test"]);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Test",
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
          // Raw integers as returned by AnkiConnect
          return Promise.resolve([4100, 2500, 3000]);
        }

        if (action === "getIntervals") {
          return Promise.resolve([10, 20, 30]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert - ease values should be divided by 1000
      expect(result.ease.count).toBe(3);
      expect(result.ease.mean).toBeCloseTo(3.2, 1); // (4.1 + 2.5 + 3.0) / 3
      expect(result.ease.max).toBeCloseTo(4.1, 1);
      expect(result.ease.min).toBeCloseTo(2.5, 1);
    });

    it("should filter out negative intervals", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(["Test"]);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Test",
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
          // Mix of negative (learning) and positive (review)
          return Promise.resolve([
            ...Array(5).fill(-3600), // Learning cards (negative)
            ...Array(10).fill(30), // Review cards (positive)
          ]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert - only positive intervals counted
      expect(result.intervals.count).toBe(10);
      expect(result.intervals.mean).toBe(30);
    });

    it("should handle AnkiConnect errors gracefully", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(
        new Error("AnkiConnect: connection refused"),
      );

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("connection refused");
    });

    it("should call reportProgress correctly", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(["Test"]);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Test",
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
          return Promise.resolve(Array(5).fill(15));
        }

        return Promise.resolve({});
      });

      // Act
      await tool.execute({}, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalled();
      const calls = mockContext.reportProgress.mock.calls;

      // Should have multiple progress updates
      expect(calls.length).toBeGreaterThan(1);

      // First call should be 10%
      expect(calls[0][0]).toEqual({ progress: 10, total: 100 });

      // Last call should be 100%
      expect(calls[calls.length - 1][0]).toEqual({ progress: 100, total: 100 });
    });

    it("should handle findCards returning empty despite getDeckStats showing cards", async () => {
      // Arrange
      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "deckNames") {
          return Promise.resolve(["Test"]);
        }

        if (action === "getDeckStats") {
          return Promise.resolve({
            "1": {
              deck_id: 1,
              name: "Test",
              new_count: 10,
              learn_count: 0,
              review_count: 0,
              total_in_deck: 10,
            },
          });
        }

        if (action === "findCards") {
          return Promise.resolve([]); // No cards found
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({}, mockContext);
      const result = parseToolResult(rawResult) as CollectionStatsResult;

      // Assert - should still return counts from getDeckStats
      expect(result.total_decks).toBe(1);
      expect(result.counts.total).toBe(10);
      expect(result.ease.count).toBe(0);
      expect(result.intervals.count).toBe(0);
    });
  });
});
