import { Test, TestingModule } from "@nestjs/testing";
import { GuiBrowseTool } from "../gui-browse.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiBrowseTool", () => {
  let tool: GuiBrowseTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiBrowseTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiBrowseTool>(GuiBrowseTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiBrowse", () => {
    it("should successfully open browser with query and return card IDs", async () => {
      const mockCardIds = [1234567890, 9876543210, 1111111111];
      mockAnkiClient.invoke.mockResolvedValue(mockCardIds);

      const rawResult = await tool.guiBrowse({
        query: "deck:Spanish tag:verb",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cardIds).toEqual(mockCardIds);
      expect(result.cardCount).toBe(3);
      expect(result.query).toBe("deck:Spanish tag:verb");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiBrowse", {
        query: "deck:Spanish tag:verb",
      });
    });

    it("should successfully open browser with reorderCards option", async () => {
      const mockCardIds = [1234567890];
      mockAnkiClient.invoke.mockResolvedValue(mockCardIds);

      const rawResult = await tool.guiBrowse({
        query: "deck:MyDeck",
        reorderCards: {
          order: "ascending",
          columnId: "noteCrt",
        },
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiBrowse", {
        query: "deck:MyDeck",
        reorderCards: {
          order: "ascending",
          columnId: "noteCrt",
        },
      });
    });

    it("should handle empty results", async () => {
      mockAnkiClient.invoke.mockResolvedValue([]);

      const rawResult = await tool.guiBrowse({ query: "deck:NonExistent" });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cardIds).toEqual([]);
      expect(result.cardCount).toBe(0);
      expect(result.hint).toContain("No cards found");
    });

    it("should handle invalid query syntax error", async () => {
      const error = new Error("Invalid query syntax");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiBrowse({ query: "invalid::query" });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid query syntax");
      expect(result.hint).toContain("Invalid search query");
    });

    it("should handle general errors", async () => {
      const error = new Error("Anki not running");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiBrowse({ query: "deck:Test" });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Anki not running");
      expect(result.hint).toContain("Make sure Anki is running");
    });
  });
});
