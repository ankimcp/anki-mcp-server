import { Test, TestingModule } from "@nestjs/testing";
import {
  AreSuspendedTool,
  areSuspendedInputSchema,
} from "../are-suspended.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("AreSuspendedTool", () => {
  let tool: AreSuspendedTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AreSuspendedTool, AnkiConnectClient],
    }).compile();

    tool = module.get<AreSuspendedTool>(AreSuspendedTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should report suspended/unsuspended/missing cards, preserving input order", async () => {
    const cards = [111, 222, 333];
    ankiClient.invoke.mockResolvedValueOnce([true, false, null]);

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("areSuspended", { cards });
    expect(result.success).toBe(true);
    expect(result.cards).toEqual([
      { cardId: 111, suspended: true },
      { cardId: 222, suspended: false },
      { cardId: 333, suspended: null },
    ]);
    expect(result.total).toBe(3);
    expect(result.suspendedCount).toBe(1);
    expect(result.unsuspendedCount).toBe(1);
    expect(result.missingCount).toBe(1);
  });

  it("should preserve duplicate card IDs and input order without deduping", async () => {
    const cards = [222, 111, 222];
    ankiClient.invoke.mockResolvedValueOnce([false, true, false]);

    const rawResult = await tool.execute({ cards });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("areSuspended", { cards });
    expect(result.cards).toEqual([
      { cardId: 222, suspended: false },
      { cardId: 111, suspended: true },
      { cardId: 222, suspended: false },
    ]);
    expect(result.total).toBe(3);
  });

  it("should fail when cards array is empty", async () => {
    const rawResult = await tool.execute({ cards: [] });
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain("cards array is required");
  });

  it("should handle AnkiConnect errors", async () => {
    ankiClient.invoke.mockRejectedValueOnce(
      new Error("collection is not open"),
    );

    const rawResult = await tool.execute({ cards: [111] });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("collection is not open");
  });

  describe("areSuspendedInputSchema", () => {
    it("should accept a valid array of positive integer card IDs", () => {
      const result = areSuspendedInputSchema.safeParse({ cards: [111, 222] });
      expect(result.success).toBe(true);
    });

    it.each([0, -1, 1.5])("should reject a card ID of %p", (badId) => {
      const result = areSuspendedInputSchema.safeParse({ cards: [badId] });
      expect(result.success).toBe(false);
    });

    it("should reject an empty cards array", () => {
      const result = areSuspendedInputSchema.safeParse({ cards: [] });
      expect(result.success).toBe(false);
    });

    it("should reject more than 500 card IDs", () => {
      const cards = Array.from({ length: 501 }, (_, i) => i + 1);
      const result = areSuspendedInputSchema.safeParse({ cards });
      expect(result.success).toBe(false);
    });

    it("should accept exactly 500 card IDs", () => {
      const cards = Array.from({ length: 500 }, (_, i) => i + 1);
      const result = areSuspendedInputSchema.safeParse({ cards });
      expect(result.success).toBe(true);
    });
  });
});
