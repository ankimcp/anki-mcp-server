import { Test, TestingModule } from "@nestjs/testing";
import { ChangeDeckTool } from "../change-deck.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

/**
 * Build a fake `cardsInfo` response for the given card IDs. Each entry is a
 * minimal object containing just `cardId` (mirrors AnkiConnect's shape).
 */
function mockCardsInfo(ids: number[]) {
  return ids.map((id) => ({ cardId: id }));
}

describe("ChangeDeckTool", () => {
  let tool: ChangeDeckTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChangeDeckTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ChangeDeckTool>(ChangeDeckTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should move cards to a different deck", async () => {
    const params = {
      cards: [1502098034045, 1502098034048],
      deck: "Japanese::JLPT N3",
    };
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo(params.cards)) // cardsInfo validation
      .mockResolvedValueOnce(null); // changeDeck

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsInfo", {
      cards: params.cards,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "changeDeck", {
      cards: [1502098034045, 1502098034048],
      deck: "Japanese::JLPT N3",
    });
    expect(result.success).toBe(true);
    expect(result.cardsAffected).toBe(2);
    expect(result.targetDeck).toBe("Japanese::JLPT N3");
  });

  it("should move a single card", async () => {
    const params = {
      cards: [1234567890],
      deck: "Default",
    };
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo(params.cards))
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "changeDeck", {
      cards: [1234567890],
      deck: "Default",
    });
    expect(result.success).toBe(true);
    expect(result.cardsAffected).toBe(1);
    expect(result.message).toContain("1 card(s)");
  });

  it("should trim deck name whitespace", async () => {
    const params = {
      cards: [1234567890],
      deck: "  Trimmed Deck  ",
    };
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo(params.cards))
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "changeDeck", {
      cards: [1234567890],
      deck: "Trimmed Deck",
    });
    expect(result.success).toBe(true);
    expect(result.targetDeck).toBe("Trimmed Deck");
  });

  it("should fail when cards array is empty", async () => {
    const params = {
      cards: [],
      deck: "Test Deck",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("cards array is required");
  });

  it("should fail when deck name is empty", async () => {
    const params = {
      cards: [1234567890],
      deck: "",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("deck name is required");
  });

  it("should fail when a card ID does not exist", async () => {
    const params = {
      cards: [1234567890],
      deck: "Test Deck",
    };
    // cardsInfo returns empty object for missing cards
    ankiClient.invoke.mockResolvedValueOnce([{}]);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    // Only cardsInfo should have been called — changeDeck must NOT fire
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(ankiClient.invoke).toHaveBeenCalledWith("cardsInfo", {
      cards: params.cards,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("1234567890");
    expect(result.error).toContain("do not exist");
  });

  it("should fail when some IDs are valid and others are missing", async () => {
    const params = {
      cards: [111, 222, 333],
      deck: "Test Deck",
    };
    // First and third exist, middle one is missing
    ankiClient.invoke.mockResolvedValueOnce([
      { cardId: 111 },
      {},
      { cardId: 333 },
    ]);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("222");
    expect(result.error).not.toContain("111");
    expect(result.error).not.toContain("333");
  });

  it("should truncate the invalid-IDs list when it is huge", async () => {
    const bogusIds = Array.from({ length: 25 }, (_, i) => 1000 + i);
    const params = {
      cards: bogusIds,
      deck: "Test Deck",
    };
    // All missing
    ankiClient.invoke.mockResolvedValueOnce(bogusIds.map(() => ({})));

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("and 15 more");
  });

  it("should handle network errors", async () => {
    const params = {
      cards: [1234567890],
      deck: "Test Deck",
    };
    ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should handle AnkiConnect errors on changeDeck", async () => {
    const params = {
      cards: [9999999999],
      deck: "Test Deck",
    };
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo(params.cards))
      .mockRejectedValueOnce(new Error("Card not found"));

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Card not found");
  });

  it("should report progress", async () => {
    const params = {
      cards: [1234567890],
      deck: "Test Deck",
    };
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo(params.cards))
      .mockResolvedValueOnce(null);

    await tool.execute(params, mockContext);

    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 25,
      total: 100,
    });
    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 100,
      total: 100,
    });
  });
});
