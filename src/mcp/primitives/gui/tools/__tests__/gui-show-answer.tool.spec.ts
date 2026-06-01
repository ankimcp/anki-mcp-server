import { Test, TestingModule } from "@nestjs/testing";
import { GuiShowAnswerTool } from "../gui-show-answer.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiShowAnswerTool", () => {
  let tool: GuiShowAnswerTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiShowAnswerTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiShowAnswerTool>(GuiShowAnswerTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiShowAnswer", () => {
    it("should successfully show answer when in review", async () => {
      mockAnkiClient.invoke.mockResolvedValue(true);

      const rawResult = await tool.guiShowAnswer({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.inReview).toBe(true);
      expect(result.message).toContain("Answer side is now displayed");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiShowAnswer");
    });

    it("should handle not in review mode (returns false)", async () => {
      mockAnkiClient.invoke.mockResolvedValue(false);

      const rawResult = await tool.guiShowAnswer({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.inReview).toBe(false);
      expect(result.message).toContain("Not in review mode");
    });

    it("should handle errors", async () => {
      const error = new Error("Connection lost");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiShowAnswer({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection lost");
    });
  });
});
