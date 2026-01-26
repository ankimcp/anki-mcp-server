import { Test, TestingModule } from "@nestjs/testing";
import { GetCardsTool } from "../get-cards.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { mockCards } from "../../../../../test-fixtures/mock-data";
import {
  parseToolResult,
  createMockContext,
} from "../../../../../test-fixtures/test-helpers";
import { AnkiCard } from "../../../../types/anki.types";

// Mock the AnkiConnectClient
jest.mock("../../../../clients/anki-connect.client");

describe("GetCardsTool", () => {
  let tool: GetCardsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GetCardsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<GetCardsTool>(GetCardsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("getCards", () => {
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

    it("should return due cards by default", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds) // findCards
        .mockResolvedValueOnce(mockCardsInfo); // cardsInfo

      // Act
      const rawResult = await tool.getCards({}, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "is:due",
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "cardsInfo", {
        cards: mockCardIds,
      });

      expect(result.success).toBe(true);
      expect(result.cards).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.returned).toBe(2);
      expect(result.message).toContain("Found 2 due cards");
      expect(mockContext.reportProgress).toHaveBeenCalled();
    });

    it("should filter by new card state", async () => {
      // Arrange
      const newCardIds = [1502298033758];
      const newCardsInfo = [mockCardsInfo[1]];
      ankiClient.invoke
        .mockResolvedValueOnce(newCardIds)
        .mockResolvedValueOnce(newCardsInfo);

      // Act
      const rawResult = await tool.getCards({ card_state: "new" }, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "is:new",
      });
      expect(result.success).toBe(true);
      expect(result.cards).toHaveLength(1);
      expect(result.message).toContain("new cards");
    });

    it("should filter by learning card state", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([1502298033758])
        .mockResolvedValueOnce([mockCardsInfo[1]]);

      // Act
      const rawResult = await tool.getCards(
        { card_state: "learning" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "is:learn",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("learning cards");
    });

    it("should filter by suspended card state", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([1502298033758])
        .mockResolvedValueOnce([mockCardsInfo[1]]);

      // Act
      const rawResult = await tool.getCards(
        { card_state: "suspended" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "is:suspended",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("suspended cards");
    });

    it("should filter by buried card state", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([1502298033758])
        .mockResolvedValueOnce([mockCardsInfo[1]]);

      // Act
      const rawResult = await tool.getCards(
        { card_state: "buried" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: "is:buried",
      });
      expect(result.success).toBe(true);
      expect(result.message).toContain("buried cards");
    });

    it("should filter by deck name", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardIds)
        .mockResolvedValueOnce(mockCardsInfo);

      // Act
      const rawResult = await tool.getCards(
        { deck_name: "Spanish", card_state: "due" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: '"deck:Spanish" is:due',
      });
      expect(result.success).toBe(true);
      expect(result.cards).toHaveLength(2);
    });

    it("should escape special characters in deck name", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      // Act
      await tool.getCards(
        { deck_name: 'Deck with "quotes"', card_state: "new" },
        mockContext,
      );

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: '"deck:Deck with \\"quotes\\"" is:new',
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
      const rawResult = await tool.getCards({ limit: 5 }, mockContext);
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
      await tool.getCards({ limit: 100 }, mockContext);

      // Assert - should only request 50 cards max
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "cardsInfo", {
        cards: manyCardIds.slice(0, 50),
      });
    });

    it("should return empty array when no cards found", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]);

      // Act
      const rawResult = await tool.getCards(
        { card_state: "suspended" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.message).toBe("No suspended cards found");
      expect(result.cards).toEqual([]);
      expect(result.total).toBe(0);
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });

    it("should handle network errors gracefully", async () => {
      // Arrange
      const networkError = new Error("fetch failed");
      ankiClient.invoke.mockRejectedValueOnce(networkError);

      // Act
      const rawResult = await tool.getCards({}, mockContext);
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
      const rawResult = await tool.getCards({}, mockContext);
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
      const rawResult = await tool.getCards({}, mockContext);
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
      await tool.getCards({}, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(3);
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(1, {
        progress: 10,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(2, {
        progress: 50,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(3, {
        progress: 100,
        total: 100,
      });
    });

    it("should combine deck filter with new card state", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([mockCardIds[1]])
        .mockResolvedValueOnce([mockCardsInfo[1]]);

      // Act
      const rawResult = await tool.getCards(
        { deck_name: "Japanese::JLPT N5", card_state: "new" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "findCards", {
        query: '"deck:Japanese::JLPT N5" is:new',
      });
      expect(result.success).toBe(true);
    });
  });
});
