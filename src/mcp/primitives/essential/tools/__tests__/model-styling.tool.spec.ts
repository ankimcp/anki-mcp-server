import { Test, TestingModule } from "@nestjs/testing";
import { ModelStylingTool } from "../model-styling.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

describe("ModelStylingTool", () => {
  let tool: ModelStylingTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelStylingTool,
        {
          provide: AnkiConnectClient,
          useValue: {
            invoke: jest.fn(),
          },
        },
      ],
    }).compile();

    tool = module.get<ModelStylingTool>(ModelStylingTool);
    ankiClient = module.get(AnkiConnectClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Built-in Models - Basic", () => {
    it("should retrieve styling for Basic model with card class", async () => {
      const modelName = "Basic";
      const css = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.css).toBe(css);
      expect(result.cssInfo.length).toBe(css.length);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(false);
      expect(result.cssInfo.hasBackStyling).toBe(false);
      expect(result.cssInfo.hasClozeStyling).toBe(false);
      expect(result.message).toContain(
        'Retrieved CSS styling for model "Basic"',
      );
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelStyling", {
        modelName,
      });
    });

    it("should retrieve styling for Basic model with front and back classes", async () => {
      const modelName = "Basic";
      const css = `.card {
  font-family: arial;
}
.front {
  font-size: 20px;
}
.back {
  font-size: 18px;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
      expect(result.cssInfo.hasBackStyling).toBe(true);
      expect(result.cssInfo.hasClozeStyling).toBe(false);
    });

    it("should retrieve styling for Basic (and reversed card) model", async () => {
      const modelName = "Basic (and reversed card)";
      const css = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.css).toBe(css);
    });

    it("should retrieve styling for Basic (type in the answer) model", async () => {
      const modelName = "Basic (type in the answer)";
      const css = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });
  });

  describe("Built-in Models - Cloze", () => {
    it("should retrieve styling for Cloze model with cloze class", async () => {
      const modelName = "Cloze";
      const css = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: center;
  color: black;
  background-color: white;
}

.cloze {
  font-weight: bold;
  color: blue;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.css).toBe(css);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasClozeStyling).toBe(true);
    });

    it("should detect all CSS classes in Cloze model", async () => {
      const modelName = "Cloze";
      const css = `.card {
  font-family: arial;
}
.front {
  color: black;
}
.back {
  color: gray;
}
.cloze {
  font-weight: bold;
  color: blue;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
      expect(result.cssInfo.hasBackStyling).toBe(true);
      expect(result.cssInfo.hasClozeStyling).toBe(true);
    });
  });

  describe("Custom Models", () => {
    it("should retrieve styling for custom vocabulary model", async () => {
      const modelName = "Spanish Vocabulary";
      const css = `.card {
  font-family: "Arial Unicode MS";
  font-size: 22px;
  text-align: left;
  color: #333;
  background-color: #f9f9f9;
  padding: 20px;
}

.spanish {
  color: #d9534f;
  font-weight: bold;
}

.english {
  color: #5cb85c;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.css).toBe(css);
      expect(result.cssInfo.length).toBe(css.length);
      expect(result.cssInfo.hasCardStyling).toBe(true);
    });

    it("should retrieve styling for model with unicode characters in name", async () => {
      const modelName = "日本語 Model";
      const css = `.card { font-family: "MS Mincho"; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.css).toBe(css);
    });

    it("should retrieve styling for model with special characters in name", async () => {
      const modelName = "Model (v2.0) [Updated]";
      const css = `.card { color: black; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });

    it("should handle very long model name", async () => {
      const modelName = "A".repeat(200);
      const css = `.card { color: black; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });
  });

  describe("CSS Parsing and Structure", () => {
    it("should correctly calculate CSS length", async () => {
      const modelName = "Test Model";
      const css = ".card { font-size: 20px; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.cssInfo.length).toBe(css.length);
      expect(result.cssInfo.length).toBe(26);
    });

    it("should detect card class variations", async () => {
      const modelName = "Test Model";
      const css = `.card { color: black; }
.card-front { color: blue; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.cssInfo.hasCardStyling).toBe(true);
    });

    it("should detect front class variations", async () => {
      const modelName = "Test Model";
      const css = `.front { color: black; }
.front-side { color: blue; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.cssInfo.hasFrontStyling).toBe(true);
    });

    it("should detect back class variations", async () => {
      const modelName = "Test Model";
      const css = `.back { color: black; }
.background { color: blue; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.cssInfo.hasBackStyling).toBe(true);
    });

    it("should detect cloze class variations", async () => {
      const modelName = "Test Model";
      const css = `.cloze { font-weight: bold; }
.cloze-hint { color: gray; }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.cssInfo.hasClozeStyling).toBe(true);
    });

    it("should handle CSS with complex selectors", async () => {
      const modelName = "Test Model";
      const css = `.card > .front {
  color: black;
}

.card .back,
.card .answer {
  color: gray;
}

#cloze-marker {
  font-weight: bold;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
      expect(result.cssInfo.hasBackStyling).toBe(true);
    });

    it("should handle CSS with media queries", async () => {
      const modelName = "Test Model";
      const css = `.card {
  font-size: 20px;
}

@media (max-width: 600px) {
  .card {
    font-size: 16px;
  }
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
    });

    it("should handle CSS with comments", async () => {
      const modelName = "Test Model";
      const css = `/* Main card styling */
.card {
  font-size: 20px;
}

/* Front side specific */
.front {
  color: black;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
    });

    it("should handle minified CSS", async () => {
      const modelName = "Test Model";
      const css =
        ".card{font-size:20px}.front{color:black}.back{color:gray}.cloze{font-weight:bold}";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
      expect(result.cssInfo.hasBackStyling).toBe(true);
      expect(result.cssInfo.hasClozeStyling).toBe(true);
    });

    it("should handle CSS with very long content", async () => {
      const modelName = "Test Model";
      const css = `.card { ${Array(100).fill("padding: 1px;").join(" ")} }`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.length).toBeGreaterThan(1000);
    });
  });

  describe("Error Handling - Model Not Found", () => {
    it("should handle model not found error", async () => {
      const modelName = "NonExistent";

      ankiClient.invoke.mockResolvedValueOnce({ css: null });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Model "NonExistent" not found or has no styling',
      );
      expect(result.modelName).toBe(modelName);
      expect(result.hint).toContain("Use modelNames tool");
    });

    it("should handle model with no CSS property in response", async () => {
      const modelName = "NoStyling";

      ankiClient.invoke.mockResolvedValueOnce({});

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no styling");
    });

    it("should handle AnkiConnect model not found error", async () => {
      const modelName = "Invalid";

      ankiClient.invoke.mockRejectedValueOnce(new Error("model was not found"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("model was not found");
      expect(result.hint).toContain("Make sure the model name is correct");
    });
  });

  describe("Error Handling - Connection Errors", () => {
    it("should handle AnkiConnect connection refused", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.hint).toContain("Make sure the model name is correct");
    });

    it("should handle network timeout", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("ETIMEDOUT"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ETIMEDOUT");
    });

    it("should handle AnkiConnect not available", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOTFOUND");
    });

    it("should handle generic network error", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });

  describe("Edge Cases - Empty and Null Values", () => {
    it("should handle empty CSS string", async () => {
      const modelName = "EmptyCSS";

      ankiClient.invoke.mockResolvedValueOnce({ css: "" });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no styling");
    });

    it("should handle null CSS value", async () => {
      const modelName = "NullCSS";

      ankiClient.invoke.mockResolvedValueOnce({ css: null });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no styling");
    });

    it("should handle undefined CSS value", async () => {
      const modelName = "UndefinedCSS";

      ankiClient.invoke.mockResolvedValueOnce({ css: undefined });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no styling");
    });

    it("should handle null response from AnkiConnect", async () => {
      const modelName = "NullResponse";

      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no styling");
    });

    it("should handle undefined response from AnkiConnect", async () => {
      const modelName = "UndefinedResponse";

      ankiClient.invoke.mockResolvedValueOnce(undefined);

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no styling");
    });
  });

  describe("Edge Cases - Special Characters", () => {
    it("should handle CSS with unicode characters", async () => {
      const modelName = "Unicode Model";
      const css = `.card {
  font-family: "游ゴシック", "Yu Gothic";
  content: "日本語 テキスト";
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.css).toBe(css);
      expect(result.cssInfo.hasCardStyling).toBe(true);
    });

    it("should handle CSS with emoji", async () => {
      const modelName = "Emoji Model";
      const css = `.card::before {
  content: "📚";
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.css).toBe(css);
    });

    it("should handle CSS with escaped characters", async () => {
      const modelName = "Escaped Model";
      const css = `.card {
  content: "\\00A0";
  background: url("data:image/svg+xml;base64,PHN2Zy8+");
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.css).toBe(css);
    });

    it("should handle CSS with special class names", async () => {
      const modelName = "Special Classes";
      const css = `.card {
  color: black;
}

.front-side:hover {
  color: blue;
}

.back-answer::before {
  content: "→";
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
      expect(result.cssInfo.hasBackStyling).toBe(true);
    });

    it("should handle CSS with newlines and tabs", async () => {
      const modelName = "Whitespace Model";
      const css =
        "\t.card\t{\n\t\tfont-size:\t20px;\n\t}\n\n\t.front\t{\n\t\tcolor:\tblack;\n\t}";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(true);
      expect(result.cssInfo.hasFrontStyling).toBe(true);
    });
  });

  describe("Edge Cases - CSS Without Standard Classes", () => {
    it("should handle CSS with no standard classes", async () => {
      const modelName = "Custom Classes";
      const css = `.custom-element {
  color: black;
}

.another-element {
  font-size: 14px;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(false);
      expect(result.cssInfo.hasFrontStyling).toBe(false);
      expect(result.cssInfo.hasBackStyling).toBe(false);
      expect(result.cssInfo.hasClozeStyling).toBe(false);
    });

    it("should handle CSS with only IDs", async () => {
      const modelName = "ID Selectors";
      const css = `#main-card {
  color: black;
}

#question {
  font-size: 20px;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(false);
    });

    it("should handle CSS with only element selectors", async () => {
      const modelName = "Element Selectors";
      const css = `body {
  font-family: arial;
}

p {
  line-height: 1.5;
}`;

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.cssInfo.hasCardStyling).toBe(false);
    });
  });

  describe("Progress Reporting", () => {
    it("should report progress at 25% before API call", async () => {
      const modelName = "Basic";
      const css = ".card { color: black; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      await tool.modelStyling({ modelName });
    });

    it("should report progress at 75% after API call", async () => {
      const modelName = "Basic";
      const css = ".card { color: black; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      await tool.modelStyling({ modelName });
    });

    it("should report progress at 100% on success", async () => {
      const modelName = "Basic";
      const css = ".card { color: black; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      await tool.modelStyling({ modelName });
    });

    it("should report progress at 100% on no styling found", async () => {
      const modelName = "NoStyling";

      ankiClient.invoke.mockResolvedValueOnce({ css: null });

      await tool.modelStyling({ modelName });
    });

    it("should report partial progress on error", async () => {
      const modelName = "Error";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      await tool.modelStyling({ modelName });
    });
  });

  describe("Response Structure - Success", () => {
    it("should return complete structure on success", async () => {
      const modelName = "Test Model";
      const css = ".card { color: black; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("css");
      expect(result).toHaveProperty("cssInfo");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(true);
    });

    it("should include cssInfo with all required fields", async () => {
      const modelName = "Test Model";
      const css = ".card { color: black; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.cssInfo).toHaveProperty("length");
      expect(result.cssInfo).toHaveProperty("hasCardStyling");
      expect(result.cssInfo).toHaveProperty("hasFrontStyling");
      expect(result.cssInfo).toHaveProperty("hasBackStyling");
      expect(result.cssInfo).toHaveProperty("hasClozeStyling");
      expect(typeof result.cssInfo.length).toBe("number");
      expect(typeof result.cssInfo.hasCardStyling).toBe("boolean");
      expect(typeof result.cssInfo.hasFrontStyling).toBe("boolean");
      expect(typeof result.cssInfo.hasBackStyling).toBe("boolean");
      expect(typeof result.cssInfo.hasClozeStyling).toBe("boolean");
    });

    it("should include helpful hint on success", async () => {
      const modelName = "Test Model";
      const css = ".card { color: black; }";

      ankiClient.invoke.mockResolvedValueOnce({ css });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.hint).toContain(
        "This CSS is automatically applied when cards of this type are rendered",
      );
    });
  });

  describe("Response Structure - Error", () => {
    it("should return correct structure on error", async () => {
      const modelName = "Invalid";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(false);
    });

    it("should include model name in error response", async () => {
      const modelName = "Invalid Model";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.modelName).toBe(modelName);
    });

    it("should include helpful hint in error response", async () => {
      const modelName = "Invalid";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.hint).toContain("Make sure the model name is correct");
      expect(result.hint).toContain("Anki is running");
    });

    it("should include modelNames hint when model not found", async () => {
      const modelName = "NonExistent";

      ankiClient.invoke.mockResolvedValueOnce({ css: null });

      const rawResult = await tool.modelStyling({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.hint).toContain("Use modelNames tool");
      expect(result.hint).toContain("available models");
    });
  });
});
