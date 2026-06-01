import { Test, TestingModule } from "@nestjs/testing";
import { GuiCurrentCardTool } from "../gui-current-card.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { GuiCurrentCardInfo } from "../../../../types/anki.types";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiCurrentCardTool", () => {
  let tool: GuiCurrentCardTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiCurrentCardTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiCurrentCardTool>(GuiCurrentCardTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiCurrentCard", () => {
    it("should return current card information when in review", async () => {
      const mockCardInfo: GuiCurrentCardInfo = {
        answer: "<b>Hola</b>",
        question: "Hello",
        deckName: "Spanish",
        modelName: "Basic",
        cardId: 1234567890,
        buttons: [1, 2, 3, 4],
        nextReviews: ["<1m", "<10m", "4d", "15d"],
      };

      mockAnkiClient.invoke.mockResolvedValue(mockCardInfo);

      const rawResult = await tool.guiCurrentCard({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cardInfo).toEqual(mockCardInfo);
      expect(result.inReview).toBe(true);
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiCurrentCard");
    });

    it("should handle not in review mode (returns null)", async () => {
      mockAnkiClient.invoke.mockResolvedValue(null);

      const rawResult = await tool.guiCurrentCard({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cardInfo).toBeNull();
      expect(result.inReview).toBe(false);
      expect(result.message).toContain("Not currently in review mode");
    });

    it("should handle errors", async () => {
      const error = new Error("Anki GUI not responding");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiCurrentCard({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Anki GUI not responding");
    });
  });
});
