import { Test, TestingModule } from "@nestjs/testing";
import { UpdateModelStylingTool } from "../update-model-styling.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

// Mock the AnkiConnectClient
jest.mock("../../../../clients/anki-connect.client");

describe("UpdateModelStylingTool", () => {
  let tool: UpdateModelStylingTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UpdateModelStylingTool, AnkiConnectClient],
    }).compile();

    tool = module.get<UpdateModelStylingTool>(UpdateModelStylingTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("updateModelStyling", () => {
    it("should update model styling successfully", async () => {
      // Arrange
      const oldCss = ".card { font-size: 16px; }";
      const newCss = ".card { font-size: 20px; color: blue; }";

      ankiClient.invoke
        .mockResolvedValueOnce({ css: oldCss }) // modelStyling call
        .mockResolvedValueOnce(null); // updateModelStyling call

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Basic",
        css: newCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "modelStyling", {
        modelName: "Basic",
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(
        2,
        "updateModelStyling",
        {
          model: {
            name: "Basic",
            css: newCss,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Basic");
      expect(result.cssLength).toBe(newCss.length);
      expect(result.oldCssLength).toBe(oldCss.length);
      expect(result.cssLengthChange).toBe(newCss.length - oldCss.length);
    });

    it("should detect RTL support in CSS", async () => {
      // Arrange
      const rtlCss = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: right;
  direction: rtl;
}`;

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card {}" })
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Basic RTL",
        css: rtlCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cssInfo.hasRtlSupport).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
    });

    it("should detect RTL support without spaces", async () => {
      // Arrange
      const rtlCss = ".card{direction:rtl;}";

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card {}" })
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Test",
        css: rtlCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cssInfo.hasRtlSupport).toBe(true);
    });

    it("should analyze CSS classes", async () => {
      // Arrange
      const complexCss = `.card { font-size: 20px; }
.front { color: blue; }
.back { color: green; }
.cloze { font-weight: bold; }`;

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card {}" })
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Test",
        css: complexCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
      expect(result.cssInfo.hasBackStyling).toBe(true);
      expect(result.cssInfo.hasClozeStyling).toBe(true);
      expect(result.cssInfo.hasRtlSupport).toBe(false);
    });

    it("should work even if old styling cannot be fetched", async () => {
      // Arrange
      const newCss = ".card { font-size: 20px; }";

      ankiClient.invoke
        .mockRejectedValueOnce(new Error("Could not fetch old styling"))
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Basic",
        css: newCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Basic");
      expect(result.cssLength).toBe(newCss.length);
      expect(result.oldCssLength).toBeUndefined();
      expect(result.cssLengthChange).toBeUndefined();
    });

    it("should handle model not found error", async () => {
      // Arrange
      const newCss = ".card { font-size: 20px; }";

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card {}" })
        .mockRejectedValueOnce(new Error("model not found"));

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "NonExistent",
        css: newCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.hint).toContain("Model not found");
    });

    it("should handle AnkiConnect errors", async () => {
      // Arrange
      const newCss = ".card { font-size: 20px; }";

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card {}" })
        .mockRejectedValueOnce(new Error("Anki is not running"));

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Basic",
        css: newCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.hint).toContain("Anki is running");
    });

    it("should handle empty CSS gracefully", async () => {
      // Arrange
      const emptyCss = "";

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card { font-size: 20px; }" })
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Basic",
        css: emptyCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cssLength).toBe(0);
      expect(result.cssInfo.hasCardStyling).toBe(false);
    });

    it("should handle CSS with special characters and unicode", async () => {
      // Arrange
      const unicodeCss = `.card {
  font-family: "Arial Hebrew", "Noto Sans Hebrew";
  content: "שלום";
  direction: rtl;
}`;

      ankiClient.invoke
        .mockResolvedValueOnce({ css: ".card {}" })
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.updateModelStyling({
        modelName: "Hebrew",
        css: unicodeCss,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cssInfo.hasRtlSupport).toBe(true);
    });
  });
});
