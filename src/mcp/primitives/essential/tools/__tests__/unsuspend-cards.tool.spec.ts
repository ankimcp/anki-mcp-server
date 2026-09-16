import { Test, TestingModule } from "@nestjs/testing";
import {
  UnsuspendCardsTool,
  unsuspendCardsInputSchema,
} from "../unsuspend-cards.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("UnsuspendCardsTool", () => {
  let tool: UnsuspendCardsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UnsuspendCardsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<UnsuspendCardsTool>(UnsuspendCardsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should unsuspend a mix of already-unsuspended and suspended cards", async () => {
    const cards = [111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce([true, false]) // areSuspended (before) — 111 suspended, 222 already not
      .mockResolvedValueOnce(true) // unsuspend
      .mockResolvedValueOnce([false, false]); // areSuspended (after) — neither suspended now

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "areSuspended", {
      cards,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "unsuspend", {
      cards,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "areSuspended", {
      cards,
    });
    expect(result.success).toBe(true);
    expect(result.cardsRequested).toBe(2);
    expect(result.cardsChanged).toBe(1);
    expect(result.alreadyUnsuspended).toEqual([222]);
    expect(result.cards).toEqual([
      { cardId: 111, suspended: false },
      { cardId: 222, suspended: false },
    ]);
  });

  it("should dedupe duplicate card IDs before validating and unsuspending", async () => {
    const cards = [111, 111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce([true, true]) // areSuspended (before), deduped to [111, 222]
      .mockResolvedValueOnce(true) // unsuspend
      .mockResolvedValueOnce([false, false]); // areSuspended (after)

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "areSuspended", {
      cards: [111, 222],
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "unsuspend", {
      cards: [111, 222],
    });
    expect(result.cardsRequested).toBe(2);
    expect(result.cardsChanged).toBe(2);
  });

  it("should treat unsuspending an already-unsuspended card as a no-op", async () => {
    const cards = [111];
    ankiClient.invoke
      .mockResolvedValueOnce([false]) // already unsuspended
      .mockResolvedValueOnce(true) // unsuspend
      .mockResolvedValueOnce([false]); // still unsuspended

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.cardsChanged).toBe(0);
    expect(result.alreadyUnsuspended).toEqual([111]);
  });

  it("should fail when cards array is empty", async () => {
    const rawResult = await tool.execute({ cards: [] });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("cards array is required");
  });

  it("should reject and not mutate when a card ID does not exist", async () => {
    const cards = [111, 222];
    // areSuspended reports a nonexistent card as null.
    ankiClient.invoke.mockResolvedValueOnce([true, null]);

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    // unsuspend must NOT fire — this is the whole point of the pre-check.
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.error).toContain("222");
    expect(result.error).toContain("No cards were unsuspended");
  });

  it("should report when the mutation doesn't fully take effect", async () => {
    const cards = [111, 222];
    ankiClient.invoke
      .mockResolvedValueOnce([true, true]) // before
      .mockResolvedValueOnce(true) // unsuspend
      .mockResolvedValueOnce([false, true]); // after — 222 didn't take

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.message).toContain("still suspended");
    expect(result.cardsChanged).toBe(1);
  });

  it("should handle network errors", async () => {
    ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

    const rawResult = await tool.execute({ cards: [111] });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should handle AnkiConnect errors on the unsuspend call", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce([true])
      .mockRejectedValueOnce(new Error("collection is not open"));

    const rawResult = await tool.execute({ cards: [111] });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("collection is not open");
  });

  describe("unsuspendCardsInputSchema", () => {
    it("should accept a valid array of positive integer card IDs", () => {
      const result = unsuspendCardsInputSchema.safeParse({
        cards: [111, 222],
      });
      expect(result.success).toBe(true);
    });

    it.each([0, -1, 1.5])("should reject a card ID of %p", (badId) => {
      const result = unsuspendCardsInputSchema.safeParse({ cards: [badId] });
      expect(result.success).toBe(false);
    });

    it("should reject an empty cards array", () => {
      const result = unsuspendCardsInputSchema.safeParse({ cards: [] });
      expect(result.success).toBe(false);
    });

    it("should reject more than 500 card IDs", () => {
      const cards = Array.from({ length: 501 }, (_, i) => i + 1);
      const result = unsuspendCardsInputSchema.safeParse({ cards });
      expect(result.success).toBe(false);
    });

    it("should accept exactly 500 card IDs", () => {
      const cards = Array.from({ length: 500 }, (_, i) => i + 1);
      const result = unsuspendCardsInputSchema.safeParse({ cards });
      expect(result.success).toBe(true);
    });
  });
});
