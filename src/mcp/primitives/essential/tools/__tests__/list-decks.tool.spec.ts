import { Test, TestingModule } from "@nestjs/testing";
import { ListDecksTool } from "../list-decks.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("ListDecksTool", () => {
  let tool: ListDecksTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ListDecksTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ListDecksTool>(ListDecksTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should return deck names without stats when includeStats is false", async () => {
    const deckNames = ["Default", "Japanese", "Spanish"];
    ankiClient.invoke.mockResolvedValueOnce(deckNames);

    const rawResult = await tool.execute({ includeStats: false }, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(ankiClient.invoke).toHaveBeenCalledWith("deckNames");
    expect(result.success).toBe(true);
    expect(result.decks).toHaveLength(3);
    expect(result.decks[0]).toEqual({ name: "Default" });
    expect(result.summary).toBeUndefined();
  });

  it("should return deck names with stats when includeStats is true", async () => {
    const deckNames = ["Spanish", "Japanese"];
    const deckNamesAndIds = {
      Spanish: 1234567890,
      Japanese: 1234567891,
    };
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
      .mockResolvedValueOnce(deckNamesAndIds)
      .mockResolvedValueOnce(statsResponse);

    const rawResult = await tool.execute({ includeStats: true }, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledTimes(3);
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "deckNames");
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "deckNamesAndIds", {});
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "getDeckStats", {
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

  it("should resolve child deck stats by ID when getDeckStats returns short name", async () => {
    const deckNames = ["Test", "Test::STDIO-AddNotes"];
    const deckNamesAndIds = {
      Test: 1111111111,
      "Test::STDIO-AddNotes": 2222222222,
    };
    const statsResponse = {
      "1111111111": {
        deck_id: 1111111111,
        name: "Test",
        new_count: 0,
        learn_count: 0,
        review_count: 0,
        total_in_deck: 0,
      },
      "2222222222": {
        deck_id: 2222222222,
        name: "STDIO-AddNotes",
        new_count: 5,
        learn_count: 2,
        review_count: 8,
        total_in_deck: 15,
      },
    };
    ankiClient.invoke
      .mockResolvedValueOnce(deckNames)
      .mockResolvedValueOnce(deckNamesAndIds)
      .mockResolvedValueOnce(statsResponse);

    const rawResult = await tool.execute({ includeStats: true }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.decks).toHaveLength(2);

    const childDeck = result.decks.find(
      (d: any) => d.name === "Test::STDIO-AddNotes",
    );
    expect(childDeck).toBeDefined();
    expect(childDeck.stats).toBeDefined();
    expect(childDeck.stats.total_cards).toBe(15);
    expect(childDeck.stats.new_count).toBe(5);
    expect(childDeck.stats.learn_count).toBe(2);
    expect(childDeck.stats.review_count).toBe(8);
    expect(childDeck.stats.name).toBe("Test::STDIO-AddNotes");

    expect(result.summary).toMatchObject({
      total_cards: 15,
      new_cards: 5,
      learning_cards: 2,
      review_cards: 8,
    });
  });

  it("should handle empty deck list gracefully", async () => {
    ankiClient.invoke.mockResolvedValueOnce([]);

    const rawResult = await tool.execute({ includeStats: false }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.message).toBe("No decks found in Anki");
    expect(result.decks).toEqual([]);
  });

  it("should handle network errors gracefully", async () => {
    ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

    const rawResult = await tool.execute({ includeStats: false }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("fetch failed");
  });

  it("should report progress", async () => {
    ankiClient.invoke.mockResolvedValueOnce(["Deck1"]);

    await tool.execute({}, mockContext);

    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 10,
      total: 100,
    });
    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 100,
      total: 100,
    });
  });
});
