import { Test, TestingModule } from "@nestjs/testing";
import { SetDueDateTool, setDueDateInputSchema } from "../set-due-date.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

function mockCardsInfo(ids: number[], interval = 10, due = 500) {
  return ids.map((cardId) => ({ cardId, interval, due }));
}

/**
 * Build a fake `cardsModTime` response, used for the existence pre-check.
 * Missing cards come back as `{}`, same as `cardsInfo`.
 */
function mockCardsModTime(ids: number[]) {
  return ids.map((cardId) => ({ cardId, mod: 1700000000 }));
}

describe("SetDueDateTool", () => {
  let tool: SetDueDateTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SetDueDateTool, AnkiConnectClient],
    }).compile();

    tool = module.get<SetDueDateTool>(SetDueDateTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should reschedule cards", async () => {
    const cards = [111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime(cards)) // cardsModTime validation
      .mockResolvedValueOnce(true) // setDueDate
      .mockResolvedValueOnce(mockCardsInfo(cards, 0, 20500)); // cardsInfo read-back

    const rawResult = await tool.execute({ cards, days: "0" });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsModTime", {
      cards,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "setDueDate", {
      cards,
      days: "0",
    });
    expect(result.success).toBe(true);
    expect(result.cardsAffected).toBe(2);
    expect(result.days).toBe("0");
    expect(result.intervalOverwritten).toBe(false);
  });

  it("should read scheduling back after the change", async () => {
    const cards = [111];
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime(cards))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce([{ cardId: 111, interval: 1, due: 20777 }]);

    const rawResult = await tool.execute({ cards, days: "1!" });
    const result = parseToolResult(rawResult);

    expect(result.scheduled).toEqual([
      { cardId: 111, intervalDays: 1, due: 20777 },
    ]);
    expect(result.intervalOverwritten).toBe(true);
  });

  it("should dedupe duplicate card IDs before validating and rescheduling", async () => {
    const cards = [111, 111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime([111, 222]))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(mockCardsInfo([111, 222]));

    const rawResult = await tool.execute({ cards, days: "0" });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsModTime", {
      cards: [111, 222],
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "setDueDate", {
      cards: [111, 222],
      days: "0",
    });
    expect(result.cardsAffected).toBe(2);
    expect(result.scheduled).toHaveLength(2);
  });

  it.each(["0", "5", "3-7", "1!", "3-7!"])(
    'should accept the days spec "%s"',
    async (days) => {
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardsModTime([111]))
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(mockCardsInfo([111]));

      const rawResult = await tool.execute({ cards: [111], days });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.days).toBe(days);
    },
  );

  it.each(["tomorrow", "-3", "3..7", "", "1!!", "3-"])(
    'should reject the days spec "%s"',
    async (days) => {
      const rawResult = await tool.execute({ cards: [111], days });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
    },
  );

  it("should reject a backwards range", async () => {
    const rawResult = await tool.execute({ cards: [111], days: "7-3" });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("must not be");
  });

  it("should trim whitespace around the days spec", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime([111]))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(mockCardsInfo([111]));

    const rawResult = await tool.execute({ cards: [111], days: "  3-7  " });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "setDueDate", {
      cards: [111],
      days: "3-7",
    });
    expect(result.days).toBe("3-7");
  });

  it("should fail when cards array is empty", async () => {
    const rawResult = await tool.execute({ cards: [], days: "0" });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("cards array is required");
  });

  it("should not reschedule anything when a card ID does not exist", async () => {
    ankiClient.invoke.mockResolvedValueOnce([{ cardId: 111 }, {}]);

    const rawResult = await tool.execute({ cards: [111, 222], days: "0" });
    const result = parseToolResult(rawResult);

    // setDueDate returns true even for bogus IDs, so the pre-check must stop it.
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsModTime", {
      cards: [111, 222],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("222");
    expect(result.error).toContain("No cards were rescheduled");
  });

  it("should handle network errors", async () => {
    ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

    const rawResult = await tool.execute({ cards: [111], days: "0" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should still report success when the read-back fails after the reschedule", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime([111])) // cardsModTime validation
      .mockResolvedValueOnce(true) // setDueDate — committed
      .mockRejectedValueOnce(new Error("Anki closed")); // cardsInfo read-back

    const rawResult = await tool.execute({ cards: [111], days: "3-7" });
    const result = parseToolResult(rawResult);

    // The mutation landed, so reporting it as a failure would invite a retry —
    // and retrying a range spec re-rolls the dates.
    expect(result.success).toBe(true);
    expect(result.cardsAffected).toBe(1);
    expect(result.scheduled).toEqual([]);
    expect(result.message).toContain("do not retry");
  });

  it("should treat a short read-back array as a failed read-back", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime([111, 222]))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(mockCardsInfo([111])); // only one entry for two cards

    const rawResult = await tool.execute({ cards: [111, 222], days: "0" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.scheduled).toEqual([]);
    expect(result.message).toContain("do not retry");
  });

  it("should treat a non-array read-back as a failed read-back", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime([111]))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute({ cards: [111], days: "0" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.scheduled).toEqual([]);
    expect(result.message).toContain("do not retry");
  });

  it("should treat a card deleted between mutation and read-back as a failed read-back", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce(mockCardsModTime([111, 222]))
      .mockResolvedValueOnce(true)
      // Right length, but 222 was deleted between setDueDate and this read-back.
      .mockResolvedValueOnce([{ cardId: 111, interval: 10, due: 500 }, {}]);

    const rawResult = await tool.execute({ cards: [111, 222], days: "0" });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.scheduled).toEqual([]);
    expect(result.message).toContain("do not retry");
  });

  describe("setDueDateInputSchema", () => {
    it("should accept a valid array of positive integer card IDs", () => {
      const result = setDueDateInputSchema.safeParse({
        cards: [111, 222],
        days: "0",
      });
      expect(result.success).toBe(true);
    });

    it.each([0, -1, 1.5])("should reject a card ID of %p", (badId) => {
      const result = setDueDateInputSchema.safeParse({
        cards: [badId],
        days: "0",
      });
      expect(result.success).toBe(false);
    });

    it("should reject an empty cards array", () => {
      const result = setDueDateInputSchema.safeParse({ cards: [], days: "0" });
      expect(result.success).toBe(false);
    });

    it("should reject more than 100 card IDs", () => {
      const cards = Array.from({ length: 101 }, (_, i) => i + 1);
      const result = setDueDateInputSchema.safeParse({ cards, days: "0" });
      expect(result.success).toBe(false);
    });

    it("should accept exactly 100 card IDs", () => {
      const cards = Array.from({ length: 100 }, (_, i) => i + 1);
      const result = setDueDateInputSchema.safeParse({ cards, days: "0" });
      expect(result.success).toBe(true);
    });
  });
});
