import { Test, TestingModule } from "@nestjs/testing";
import { SetDueDateTool } from "../set-due-date.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

function mockCardsInfo(ids: number[], interval = 10, due = 500) {
  return ids.map((cardId) => ({ cardId, interval, due }));
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
      .mockResolvedValueOnce(mockCardsInfo(cards)) // cardsInfo validation
      .mockResolvedValueOnce(true) // setDueDate
      .mockResolvedValueOnce(mockCardsInfo(cards, 0, 20500)); // cardsInfo read-back

    const rawResult = await tool.execute({ cards, days: "0" });
    const result = parseToolResult(rawResult);

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
      .mockResolvedValueOnce(mockCardsInfo(cards))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce([{ cardId: 111, interval: 1, due: 20777 }]);

    const rawResult = await tool.execute({ cards, days: "1!" });
    const result = parseToolResult(rawResult);

    expect(result.scheduled).toEqual([
      { cardId: 111, intervalDays: 1, due: 20777 },
    ]);
    expect(result.intervalOverwritten).toBe(true);
  });

  it.each(["0", "5", "3-7", "1!", "3-7!"])(
    'should accept the days spec "%s"',
    async (days) => {
      ankiClient.invoke
        .mockResolvedValueOnce(mockCardsInfo([111]))
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
      .mockResolvedValueOnce(mockCardsInfo([111]))
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
});
