import { Test, TestingModule } from "@nestjs/testing";
import { DeckActionsTool } from "../deckActions.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import type { DeckStatsResult } from "../actions/deckStats.action";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

describe("DeckActionsTool", () => {
  let tool: DeckActionsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeckActionsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<DeckActionsTool>(DeckActionsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("listDecks action", () => {
    it("should return deck names without stats when includeStats is false", async () => {
      // Arrange
      const deckNames = ["Default", "Japanese", "Spanish"];
      ankiClient.invoke.mockResolvedValueOnce(deckNames);

      // Act
      const rawResult = await tool.execute(
        { action: "listDecks", includeStats: false },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).toHaveBeenCalledWith("deckNames");
      expect(result.success).toBe(true);
      expect(result.decks).toHaveLength(3);
      expect(result.decks[0]).toEqual({ name: "Default" });
      expect(result.summary).toBeUndefined();
    });

    it("should return deck names with stats when includeStats is true", async () => {
      // Arrange
      const deckNames = ["Spanish", "Japanese"];
      const statsResponse = {
        "1234567890": {
          deck_id: 1234567890,
          name: "Spanish",
          new_count: 20,
          learn_count: 5,
          review_count: 10,
          total_in_deck: 150,
        },
        "1234567891": {
          deck_id: 1234567891,
          name: "Japanese",
          new_count: 50,
          learn_count: 10,
          review_count: 25,
          total_in_deck: 500,
        },
      };
      ankiClient.invoke
        .mockResolvedValueOnce(deckNames)
        .mockResolvedValueOnce(statsResponse);

      // Act
      const rawResult = await tool.execute(
        { action: "listDecks", includeStats: true },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "deckNames");
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "getDeckStats", {
        decks: deckNames,
      });

      expect(result.success).toBe(true);
      expect(result.decks).toHaveLength(2);

      const spanishDeck = result.decks.find((d: any) => d.name === "Spanish");
      expect(spanishDeck.stats).toMatchObject({
        name: "Spanish",
        new_count: 20,
        learn_count: 5,
        review_count: 10,
        total_cards: 150,
      });

      expect(result.summary).toMatchObject({
        total_cards: 650,
        new_cards: 70,
        learning_cards: 15,
        review_cards: 35,
      });
    });

    it("should handle empty deck list gracefully", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]);

      // Act
      const rawResult = await tool.execute(
        { action: "listDecks", includeStats: false },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe("No decks found in Anki");
      expect(result.decks).toEqual([]);
    });

    it("should handle network errors gracefully", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      // Act
      const rawResult = await tool.execute(
        { action: "listDecks", includeStats: false },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("fetch failed");
    });
  });

  describe("createDeck action", () => {
    it("should successfully create a simple deck", async () => {
      // Arrange
      const deckName = "Spanish Vocabulary";
      const deckId = 1651445861967;

      ankiClient.invoke.mockResolvedValueOnce(deckId);

      // Act
      const rawResult = await tool.execute(
        { action: "createDeck", deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.deckId).toBe(deckId);
      expect(result.deckName).toBe(deckName);
      expect(result.message).toContain("Successfully created");
      expect(ankiClient.invoke).toHaveBeenCalledWith("createDeck", {
        deck: deckName,
      });
    });

    it("should create a parent::child deck structure", async () => {
      // Arrange
      const deckName = "Languages::Spanish";
      const deckId = 1651445861971;

      ankiClient.invoke.mockResolvedValueOnce(deckId);

      // Act
      const rawResult = await tool.execute(
        { action: "createDeck", deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.parentDeck).toBe("Languages");
      expect(result.childDeck).toBe("Spanish");
      expect(result.message).toContain('parent deck "Languages"');
    });

    it("should reject deck with more than 2 levels", async () => {
      // Arrange
      const deckName = "Languages::Spanish::Vocabulary";

      // Act
      const rawResult = await tool.execute(
        { action: "createDeck", deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("maximum 2 levels");
      expect(ankiClient.invoke).not.toHaveBeenCalled();
    });

    it("should reject deck name with empty parts", async () => {
      // Arrange - leading ::
      const rawResult = await tool.execute(
        { action: "createDeck", deckName: "::InvalidDeck" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("empty");
      expect(ankiClient.invoke).not.toHaveBeenCalled();
    });

    it("should fail when deckName is not provided", async () => {
      // Act
      const rawResult = await tool.execute(
        { action: "createDeck" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("deckName is required");
    });

    it("should handle deck already exists scenario", async () => {
      // Arrange
      const deckName = "Existing Deck";

      // First call returns null, second call returns deck list with our deck
      ankiClient.invoke
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([deckName, "Other Deck"]);

      // Act
      const rawResult = await tool.execute(
        { action: "createDeck", deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toContain("already exists");
      expect(result.created).toBe(false);
      expect(result.exists).toBe(true);
    });

    it("should handle AnkiConnect errors", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(new Error("AnkiConnect error"));

      // Act
      const rawResult = await tool.execute(
        { action: "createDeck", deckName: "Test Deck" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("AnkiConnect error");
    });
  });

  describe("deckStats action", () => {
    it("should return deck stats with distributions", async () => {
      // Arrange
      const deckName = "Test Deck";

      ankiClient.invoke.mockImplementation((action: string) => {
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
          return Promise.resolve(Array.from({ length: 35 }, (_, i) => i + 1));
        }
        if (action === "getEaseFactors") {
          return Promise.resolve([
            ...Array(10).fill(0),
            ...Array(5).fill(2100),
            ...Array(10).fill(2500),
            ...Array(10).fill(3000),
          ]);
        }
        if (action === "getIntervals") {
          return Promise.resolve([
            ...Array(10).fill(0),
            ...Array(5).fill(-14400),
            ...Array(10).fill(15),
            ...Array(10).fill(45),
          ]);
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        { action: "deckStats", deck: deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(4);
      expect(result.deck).toBe(deckName);
      expect(result.counts).toEqual({
        total: 35,
        new: 10,
        learning: 5,
        review: 20,
      });
      expect(result.ease.count).toBe(25);
      expect(result.intervals.count).toBe(20);
    });

    it("should handle deck not found", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce({});

      // Act
      const rawResult = await tool.execute(
        { action: "deckStats", deck: "NonExistent" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should handle empty deck", async () => {
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
      const rawResult = await tool.execute(
        { action: "deckStats", deck: deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.deck).toBe(deckName);
      expect(result.counts.total).toBe(0);
      expect(result.ease.count).toBe(0);
      expect(result.intervals.count).toBe(0);
    });

    it("should use custom bucket boundaries", async () => {
      // Arrange
      const deckName = "Custom Buckets";

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
          return Promise.resolve(Array(10).fill(2000));
        }
        if (action === "getIntervals") {
          return Promise.resolve(Array(10).fill(30));
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        {
          action: "deckStats",
          deck: deckName,
          easeBuckets: [1.5, 2.0, 2.5],
          intervalBuckets: [14, 30, 60],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.ease.buckets).toBeDefined();
      expect(result.intervals.buckets).toBeDefined();

      const easeBucketKeys = Object.keys(result.ease.buckets);
      expect(easeBucketKeys.some((k) => k.includes("1.5"))).toBe(true);

      const intervalBucketKeys = Object.keys(result.intervals.buckets);
      expect(intervalBucketKeys.some((k) => k.includes("14"))).toBe(true);
    });

    it("should fail when deck is not provided", async () => {
      // Act
      const rawResult = await tool.execute(
        { action: "deckStats" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("deck name is required");
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
          return Promise.resolve([4100, 2500, 3000]);
        }
        if (action === "getIntervals") {
          return Promise.resolve([10, 20, 30]);
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        { action: "deckStats", deck: deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.ease.count).toBe(3);
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
          return Promise.resolve([
            ...Array(5).fill(-7200),
            ...Array(10).fill(25),
          ]);
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute(
        { action: "deckStats", deck: deckName },
        mockContext,
      );
      const result = parseToolResult(rawResult) as DeckStatsResult;

      // Assert
      expect(result.intervals.count).toBe(10);
      expect(result.intervals.mean).toBe(25);
    });
  });

  describe("changeDeck action", () => {
    it("should move cards to a different deck", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1502098034045, 1502098034048],
        deck: "Japanese::JLPT N3",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("changeDeck", {
        cards: [1502098034045, 1502098034048],
        deck: "Japanese::JLPT N3",
      });
      expect(result.success).toBe(true);
      expect(result.cardsAffected).toBe(2);
      expect(result.targetDeck).toBe("Japanese::JLPT N3");
    });

    it("should move a single card", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1234567890],
        deck: "Default",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("changeDeck", {
        cards: [1234567890],
        deck: "Default",
      });
      expect(result.success).toBe(true);
      expect(result.cardsAffected).toBe(1);
      expect(result.message).toContain("1 card(s)");
    });

    it("should trim deck name whitespace", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1234567890],
        deck: "  Trimmed Deck  ",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("changeDeck", {
        cards: [1234567890],
        deck: "Trimmed Deck",
      });
      expect(result.success).toBe(true);
      expect(result.targetDeck).toBe("Trimmed Deck");
    });

    it("should fail when cards array is empty", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [],
        deck: "Test Deck",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("cards array is required");
    });

    it("should fail when cards array is missing", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        deck: "Test Deck",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("cards array is required");
    });

    it("should fail when deck name is empty", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1234567890],
        deck: "",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("deck name is required");
    });

    it("should fail when deck name is missing", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1234567890],
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("deck name is required");
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1234567890],
        deck: "Test Deck",
      };
      ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should handle AnkiConnect errors", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [9999999999],
        deck: "Test Deck",
      };
      ankiClient.invoke.mockRejectedValueOnce(new Error("Card not found"));

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Card not found");
    });
  });

  describe("progress reporting", () => {
    it("should report progress for listDecks", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce(["Deck1"]);

      // Act
      await tool.execute({ action: "listDecks" }, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 10,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });

    it("should report progress for createDeck", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce(123456);

      // Act
      await tool.execute(
        { action: "createDeck", deckName: "Test Deck" },
        mockContext,
      );

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });

    it("should report progress for changeDeck", async () => {
      // Arrange
      const params = {
        action: "changeDeck" as const,
        cards: [1234567890],
        deck: "Test Deck",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      await tool.execute(params, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });

    it("should report progress for deckStats", async () => {
      // Arrange
      const deckName = "Test Deck";

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
      await tool.execute({ action: "deckStats", deck: deckName }, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalled();
      const calls = mockContext.reportProgress.mock.calls;
      expect(calls.length).toBeGreaterThan(1);

      // First call should be 10%
      expect(calls[0][0]).toEqual({ progress: 10, total: 100 });

      // Last call should be 100%
      expect(calls[calls.length - 1][0]).toEqual({ progress: 100, total: 100 });
    });
  });
});
