import { Test, TestingModule } from "@nestjs/testing";
import { GuiSelectCardTool } from "../gui-select-card.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiSelectCardTool", () => {
  let tool: GuiSelectCardTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiSelectCardTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiSelectCardTool>(GuiSelectCardTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiSelectCard", () => {
    it("should successfully select a card in open browser", async () => {
      mockAnkiClient.invoke.mockResolvedValue(true);

      const rawResult = await tool.guiSelectCard({ card: 1234567890 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cardId).toBe(1234567890);
      expect(result.browserOpen).toBe(true);
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiSelectCard", {
        card: 1234567890,
      });
    });

    it("should handle browser not open (returns false)", async () => {
      mockAnkiClient.invoke.mockResolvedValue(false);

      const rawResult = await tool.guiSelectCard({ card: 1234567890 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Card Browser is not open");
      expect(result.hint).toContain("Use guiBrowse to open");
    });

    it("should handle card not found error", async () => {
      const error = new Error("Card not found in current view");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiSelectCard({ card: 9999999999 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Card not found");
      expect(result.hint).toContain("Card ID not found");
    });

    it("should handle general errors", async () => {
      const error = new Error("Connection failed");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiSelectCard({ card: 1234567890 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection failed");
      expect(result.hint).toContain("Make sure Anki is running");
    });
  });
});
