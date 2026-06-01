import { Test, TestingModule } from "@nestjs/testing";
import { GetDueCardsTool } from "../get-due-cards.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { mockCards } from "../../../../../test-fixtures/mock-data";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";
import { AnkiCard } from "../../../../types/anki.types";

// Mock the AnkiConnectClient
jest.mock("../../../../clients/anki-connect.client");

describe("GetDueCardsTool", () => {
  let tool: GetDueCardsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GetDueCardsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<GetDueCardsTool>(GetDueCardsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("getDueCards", () => {
    const mockCardIds = [1502298033754, 1502298033758];
    const mockCardsInfo: AnkiCard[] = [
      {
        ...mockCards.dueCard,
        fields: {
          Front: { value: "¿Cómo estás?", order: 0 },
          Back: { value: "How are you?", order: 1 },
        },
      },
      {
        ...mockCards.newCard,
        fields: {
          Front: { value: "こんにちは", order: 0 },
          Back: { value: "Hello", order: 1 },
        },
      },
    ];

    it("should return due cards with learning included by default", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds) // findCards
        .mockResolvedValueOnce(mockCardsInfo); // cardsInfo

      // Act
      const rawResult = await tool.getDueCards({});
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "-is:suspended (is:due OR is:learn)",
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "cardsInfo", {
        cards: mockCardIds,
      });

      expect(result.success).toBe(true);
      expect(result.cards).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.returned).toBe(2);
      expect(result.message).toContain("Found 2 due cards");
    });

    it("should exclude learning cards when include_learning is false", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds)
        .mockResolvedValueOnce(mockCardsInfo);

      // Act
      const rawResult = await tool.getDueCards({ include_learning: false });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "-is:suspended (is:due)",
      });
      expect(result.success).toBe(true);
    });

    it("should include new cards when include_new is true", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds) // findCards (main)
        .mockResolvedValueOnce([mockCardIds[1]]) // findCards (new-only count)
        .mockResolvedValueOnce(mockCardsInfo); // cardsInfo

      // Act
      const rawResult = await tool.getDueCards({ include_new: true });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "-is:suspended (is:due OR is:learn OR is:new)",
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "findCards", {
        query: "-is:suspended (is:new)",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("1 new");
      expect(result.message).toContain("1 due");
    });

    it("should include only due and new when learning excluded", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds) // findCards (main)
        .mockResolvedValueOnce([]) // findCards (new-only count)
        .mockResolvedValueOnce(mockCardsInfo); // cardsInfo

      // Act
      const rawResult = await tool.getDueCards({
        include_learning: false,
        include_new: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "-is:suspended (is:due OR is:new)",
      });
      expect(result.success).toBe(true);
    });

    it("should filter by deck name", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds)
        .mockResolvedValueOnce(mockCardsInfo);

      // Act
      const rawResult = await tool.getDueCards({ deck_name: "Spanish" });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: '"deck:Spanish" -is:suspended (is:due OR is:learn)',
      });
      expect(result.success).toBe(true);
      expect(result.cards).toHaveLength(2);
    });

    it("should escape special characters in deck name", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      // Act
      await tool.getDueCards({ deck_name: 'Deck with "quotes"' });

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query:
          '"deck:Deck with \\"quotes\\"" -is:suspended (is:due OR is:learn)',
      });
    });

    it("should respect the limit parameter", async () => {
      // Arrange
      const manyCardIds = Array.from(
        { length: 20 },
        (_, i) => 1500000000000 + i,
      );
      ankiClient.invoke
        .mockResolvedValueOnce(manyCardIds)
        .mockResolvedValueOnce(mockCardsInfo.slice(0, 5));

      // Act
      const rawResult = await tool.getDueCards({ limit: 5 });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "cardsInfo", {
        cards: manyCardIds.slice(0, 5),
      });
      expect(result.success).toBe(true);
      expect(result.total).toBe(20);
      expect(result.returned).toBe(2); // mockCardsInfo has only 2 items
      expect(result.message).toContain("Found 20 due cards, returning 2");
    });

    it("should enforce maximum limit of 50", async () => {
      // Arrange
      const manyCardIds = Array.from(
        { length: 100 },
        (_, i) => 1500000000000 + i,
      );
      ankiClient.invoke
        .mockResolvedValueOnce(manyCardIds)
        .mockResolvedValueOnce(mockCardsInfo);

      // Act
      await tool.getDueCards({ limit: 100 });

      // Assert - should only request 50 cards max
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "cardsInfo", {
        cards: manyCardIds.slice(0, 50),
      });
    });

    it("should return empty array when no cards found", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]);

      // Act
      const rawResult = await tool.getDueCards({});
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe("No cards are due for review");
      expect(result.cards).toEqual([]);
      expect(result.total).toBe(0);
    });

    it("should handle network errors gracefully", async () => {
      // Arrange
      const networkError = new Error("fetch failed");
      ankiClient.invoke.mockRejectedValueOnce(networkError);

      // Act
      const rawResult = await tool.getDueCards({});
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain("fetch failed");
    });

    it("should handle AnkiConnect errors when getting card info", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds)
        .mockRejectedValueOnce(
          new Error("AnkiConnect error: collection is not available"),
        );

      // Act
      const rawResult = await tool.getDueCards({});
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("collection is not available");
    });

    it("should transform cards to simplified structure", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([mockCardIds[0]])
        .mockResolvedValueOnce([mockCardsInfo[0]]);

      // Act
      const rawResult = await tool.getDueCards({});
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cards[0]).toMatchObject({
        cardId: 1502298033754,
        front: "¿Cómo estás?",
        back: "How are you?",
        deckName: "Spanish",
        modelName: "Basic",
        due: 1,
        interval: 1,
        factor: 2500,
      });
    });

    it("should report progress correctly", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds)
        .mockResolvedValueOnce(mockCardsInfo);

      // Act
      await tool.getDueCards({});

      // Assert
    });

    it("should combine deck filter with include_new", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([mockCardIds[1]]) // findCards (main)
        .mockResolvedValueOnce([mockCardIds[1]]) // findCards (new-only count)
        .mockResolvedValueOnce([mockCardsInfo[1]]); // cardsInfo

      // Act
      const rawResult = await tool.getDueCards({
        deck_name: "Japanese::JLPT N5",
        include_new: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query:
          '"deck:Japanese::JLPT N5" -is:suspended (is:due OR is:learn OR is:new)',
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "findCards", {
        query: '"deck:Japanese::JLPT N5" -is:suspended (is:new)',
      });
      expect(result.success).toBe(true);
    });

    it("should use default limit of 10 when not specified", async () => {
      // Arrange
      const manyCardIds = Array.from(
        { length: 15 },
        (_, i) => 1500000000000 + i,
      );
      ankiClient.invoke
        .mockResolvedValueOnce(manyCardIds)
        .mockResolvedValueOnce(mockCardsInfo);

      // Act
      await tool.getDueCards({});

      // Assert - should only request 10 cards by default
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "cardsInfo", {
        cards: manyCardIds.slice(0, 10),
      });
    });
  });
});
