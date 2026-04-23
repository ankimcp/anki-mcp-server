import { Test, TestingModule } from "@nestjs/testing";
import { GuiDeckOverviewTool } from "../gui-deck-overview.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiDeckOverviewTool", () => {
  let tool: GuiDeckOverviewTool;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiDeckOverviewTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiDeckOverviewTool>(GuiDeckOverviewTool);
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiDeckOverview", () => {
    it("should successfully open deck overview", async () => {
      mockAnkiClient.invoke.mockResolvedValue(true);

      const rawResult = await tool.guiDeckOverview(
        { name: "Spanish" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.deckName).toBe("Spanish");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiDeckOverview", {
        name: "Spanish",
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(2);
    });

    it("should handle failure to open (returns false)", async () => {
      mockAnkiClient.invoke.mockResolvedValue(false);

      const rawResult = await tool.guiDeckOverview(
        { name: "NonExistent" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to open Deck Overview");
      expect(result.hint).toContain("Use listDecks");
    });

    it("should handle deck not found error", async () => {
      const error = new Error('Deck "InvalidDeck" not found');
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiDeckOverview(
        { name: "InvalidDeck" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.hint).toContain("Use listDecks");
    });
  });
});
