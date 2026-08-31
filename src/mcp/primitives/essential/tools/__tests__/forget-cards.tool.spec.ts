import { Test, TestingModule } from "@nestjs/testing";
import { ForgetCardsTool, forgetCardsInputSchema } from "../forget-cards.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

/**
 * Build a fake `cardsInfo` response. Missing cards are represented the way
 * AnkiConnect represents them — as empty objects.
 */
function mockCardsInfo(
  cards: Array<{
    cardId: number;
    type?: number;
    interval?: number;
    reps?: number;
    lapses?: number;
  }>,
) {
  return cards.map((c) => ({
    cardId: c.cardId,
    type: c.type ?? 2,
    interval: c.interval ?? 30,
    reps: c.reps ?? 12,
    lapses: c.lapses ?? 3,
  }));
}

describe("ForgetCardsTool", () => {
  let tool: ForgetCardsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ForgetCardsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ForgetCardsTool>(ForgetCardsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should reset cards to new", async () => {
    const cards = [1502098034045, 1502098034048];
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo(cards.map((cardId) => ({ cardId })))) // cardsInfo
      .mockResolvedValueOnce(null); // forgetCards

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsInfo", {
      cards,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "forgetCards", {
      cards,
    });
    expect(result.success).toBe(true);
    expect(result.cardsAffected).toBe(2);
  });

  it("should report the state each card was in before the reset", async () => {
    const cards = [111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce(
        mockCardsInfo([
          { cardId: 111, type: 2, interval: 47, reps: 9, lapses: 2 },
          { cardId: 222, type: 0, interval: 0, reps: 0, lapses: 0 },
        ]),
      )
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(result.reset).toEqual([
      {
        cardId: 111,
        previousState: "review",
        previousIntervalDays: 47,
        reps: 9,
        lapses: 2,
      },
      {
        cardId: 222,
        previousState: "new",
        previousIntervalDays: 0,
        reps: 0,
        lapses: 0,
      },
    ]);
  });

  it("should dedupe duplicate card IDs before validating and resetting", async () => {
    const cards = [111, 111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo([{ cardId: 111 }, { cardId: 222 }]))
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsInfo", {
      cards: [111, 222],
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "forgetCards", {
      cards: [111, 222],
    });
    expect(result.cardsAffected).toBe(2);
    expect(result.reset).toHaveLength(2);
  });

  it("should fail when cards array is empty", async () => {
    const rawResult = await tool.execute({ cards: [] });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("cards array is required");
  });

  it("should not reset anything when a card ID does not exist", async () => {
    const cards = [111, 222];
    // Second card is missing — AnkiConnect returns an empty object for it.
    ankiClient.invoke.mockResolvedValueOnce([{ cardId: 111 }, {}]);

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    // forgetCards must NOT fire — this is the whole point of the pre-check,
    // since forgetCards returns null for bogus IDs too.
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("222");
    expect(result.error).toContain("No cards were reset");
  });

  it("should truncate the missing-IDs list when it is huge", async () => {
    const bogusIds = Array.from({ length: 25 }, (_, i) => 1000 + i);
    ankiClient.invoke.mockResolvedValueOnce(bogusIds.map(() => ({})));

    const rawResult = await tool.execute({ cards: bogusIds });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("and 15 more");
  });

  it("should handle network errors", async () => {
    ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

    const rawResult = await tool.execute({ cards: [1234567890] });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should handle AnkiConnect errors on forgetCards", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsInfo([{ cardId: 999 }]))
      .mockRejectedValueOnce(new Error("collection is not open"));

    const rawResult = await tool.execute({ cards: [999] });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("collection is not open");
  });

  describe("forgetCardsInputSchema", () => {
    it("should accept a valid array of positive integer card IDs", () => {
      const result = forgetCardsInputSchema.safeParse({ cards: [111, 222] });
      expect(result.success).toBe(true);
    });

    it.each([0, -1, 1.5])("should reject a card ID of %p", (badId) => {
      const result = forgetCardsInputSchema.safeParse({ cards: [badId] });
      expect(result.success).toBe(false);
    });

    it("should reject an empty cards array", () => {
      const result = forgetCardsInputSchema.safeParse({ cards: [] });
      expect(result.success).toBe(false);
    });

    it("should reject more than 100 card IDs", () => {
      const cards = Array.from({ length: 101 }, (_, i) => i + 1);
      const result = forgetCardsInputSchema.safeParse({ cards });
      expect(result.success).toBe(false);
    });

    it("should accept exactly 100 card IDs", () => {
      const cards = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = forgetCardsInputSchema.safeParse({ cards });
      expect(result.success).toBe(true);
    });
  });
});
