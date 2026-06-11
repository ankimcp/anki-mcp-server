import { Test, TestingModule } from "@nestjs/testing";
import { ModelTemplatesTool } from "../model-templates.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

describe("ModelTemplatesTool", () => {
  let tool: ModelTemplatesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelTemplatesTool,
        {
          provide: AnkiConnectClient,
          useValue: {
            invoke: jest.fn(),
          },
        },
      ],
    }).compile();

    tool = module.get<ModelTemplatesTool>(ModelTemplatesTool);
    ankiClient = module.get(AnkiConnectClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Built-in Models - Basic", () => {
    it("should retrieve templates for Basic model", async () => {
      const modelName = "Basic";
      const templates = {
        "Card 1": {
          Front: "{{Front}}",
          Back: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.templates).toEqual(templates);
      expect(Object.keys(result.templates)).toHaveLength(1);
      expect(result.templates["Card 1"].Front).toBe("{{Front}}");
      expect(result.templates["Card 1"].Back).toContain("{{FrontSide}}");
      expect(result.message).toContain(
        'Retrieved 1 card template(s) for model "Basic"',
      );
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelTemplates", {
        modelName,
      });
    });

    it("should retrieve templates for Basic (and reversed card) model", async () => {
      const modelName = "Basic (and reversed card)";
      const templates = {
        "Card 1": {
          Front: "{{Front}}",
          Back: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}",
        },
        "Card 2": {
          Front: "{{Back}}",
          Back: "{{FrontSide}}\n\n<hr id=answer>\n\n{{Front}}",
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(Object.keys(result.templates)).toHaveLength(2);
      expect(result.message).toContain("2 card template(s)");
    });

    it("should retrieve templates for Basic (type in the answer) model", async () => {
      const modelName = "Basic (type in the answer)";
      const templates = {
        "Card 1": {
          Front: "{{Front}}",
          Back: "{{FrontSide}}\n\n<hr id=answer>\n\n{{type:Back}}",
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.templates["Card 1"].Back).toContain("{{type:Back}}");
    });
  });

  describe("Built-in Models - Cloze", () => {
    it("should retrieve templates for Cloze model", async () => {
      const modelName = "Cloze";
      const templates = {
        "Card 1": {
          Front: "{{cloze:Text}}",
          Back: "{{cloze:Text}}<br>\n{{Extra}}",
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.templates["Card 1"].Front).toContain("{{cloze:Text}}");
    });
  });

  describe("Custom Models", () => {
    it("should retrieve templates for custom vocabulary model", async () => {
      const modelName = "Spanish Vocabulary";
      const templates = {
        "Card 1": {
          Front: '<div class="spanish">{{Spanish}}</div>',
          Back: '{{FrontSide}}\n<hr>\n<div class="english">{{English}}</div>',
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.templates).toEqual(templates);
    });

    it("should retrieve templates for model with unicode characters in name", async () => {
      const modelName = "日本語 Model";
      const templates = {
        "Card 1": {
          Front: "{{漢字}}",
          Back: "{{FrontSide}}\n\n<hr>\n\n{{読み方}}",
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });

    it("should retrieve templates for model with special characters in name", async () => {
      const modelName = "Model (v2.0) [Updated]";
      const templates = {
        "Card 1": { Front: "{{Field}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });

    it("should handle very long model name", async () => {
      const modelName = "A".repeat(200);
      const templates = {
        "Card 1": { Front: "{{Field}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });
  });

  describe("Template Content - HTML", () => {
    it("should handle templates with complex HTML", async () => {
      const modelName = "Styled";
      const templates = {
        "Card 1": {
          Front:
            '<div style="font-family: Arial">{{Front}}</div><script>/* inline */</script>',
          Back: '<div class="back">{{FrontSide}}<hr>{{Back}}</div>',
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.templates["Card 1"].Front).toContain("<script>");
      expect(result.templates["Card 1"].Back).toContain('<div class="back">');
    });

    it("should handle templates with conditional replacements", async () => {
      const modelName = "Conditional";
      const templates = {
        "Card 1": {
          Front: "{{#Field}}{{Field}}{{/Field}}{{^Field}}empty{{/Field}}",
          Back: "{{FrontSide}}",
        },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.templates["Card 1"].Front).toContain("{{#Field}}");
      expect(result.templates["Card 1"].Front).toContain("{{/Field}}");
    });

    it("should handle templates with very long HTML content", async () => {
      const modelName = "LongContent";
      const longHtml = "<div>" + "x".repeat(5000) + "</div>";
      const templates = {
        "Card 1": { Front: longHtml, Back: "{{FrontSide}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.templates["Card 1"].Front.length).toBe(5011);
    });
  });

  describe("Error Handling - Model Not Found", () => {
    it("should handle model not found error", async () => {
      const modelName = "NonExistent";

      ankiClient.invoke.mockResolvedValueOnce({});

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Model "NonExistent" not found or has no card templates',
      );
      expect(result.modelName).toBe(modelName);
      expect(result.hint).toContain("Use modelNames tool");
    });

    it("should handle null response from AnkiConnect", async () => {
      const modelName = "NullResponse";

      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no card templates");
    });

    it("should handle undefined response from AnkiConnect", async () => {
      const modelName = "UndefinedResponse";

      ankiClient.invoke.mockResolvedValueOnce(undefined);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found or has no card templates");
    });

    it("should handle AnkiConnect model not found error", async () => {
      const modelName = "Invalid";

      ankiClient.invoke.mockRejectedValueOnce(new Error("model was not found"));

      const rawResult = await tool.modelTemplates({ modelName });
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

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.hint).toContain("Make sure the model name is correct");
    });

    it("should handle network timeout", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("ETIMEDOUT"));

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ETIMEDOUT");
    });

    it("should handle AnkiConnect not available", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("ENOTFOUND"));

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ENOTFOUND");
    });

    it("should handle generic network error", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });

  describe("Response Structure - Success", () => {
    it("should return complete structure on success", async () => {
      const modelName = "Test Model";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("templates");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(true);
    });

    it("should include helpful hint on success", async () => {
      const modelName = "Test Model";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce(templates);

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.hint).toContain(
        "Use updateModelTemplates to modify the Front/Back HTML",
      );
    });
  });

  describe("Response Structure - Error", () => {
    it("should return correct structure on error", async () => {
      const modelName = "Invalid";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.modelTemplates({ modelName });
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

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.modelName).toBe(modelName);
    });

    it("should include helpful hint in error response", async () => {
      const modelName = "Invalid";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.modelTemplates({ modelName });
      const result = parseToolResult(rawResult);

      expect(result.hint).toContain("Make sure the model name is correct");
      expect(result.hint).toContain("Anki is running");
    });
  });
});
