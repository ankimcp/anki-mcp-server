import { Test, TestingModule } from "@nestjs/testing";
import { GuiShowQuestionTool } from "../gui-show-question.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiShowQuestionTool", () => {
  let tool: GuiShowQuestionTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiShowQuestionTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiShowQuestionTool>(GuiShowQuestionTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiShowQuestion", () => {
    it("should successfully show question when in review", async () => {
      mockAnkiClient.invoke.mockResolvedValue(true);

      const rawResult = await tool.guiShowQuestion({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.inReview).toBe(true);
      expect(result.message).toContain("Question side is now displayed");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiShowQuestion");
    });

    it("should handle not in review mode (returns false)", async () => {
      mockAnkiClient.invoke.mockResolvedValue(false);

      const rawResult = await tool.guiShowQuestion({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.inReview).toBe(false);
      expect(result.message).toContain("Not in review mode");
    });

    it("should handle errors", async () => {
      const error = new Error("GUI error");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiShowQuestion({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("GUI error");
    });
  });
});
