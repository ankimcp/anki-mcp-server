import { Test, TestingModule } from "@nestjs/testing";
import { UpdateModelTemplatesTool } from "../update-model-templates.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

describe("UpdateModelTemplatesTool", () => {
  let tool: UpdateModelTemplatesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UpdateModelTemplatesTool,
        {
          provide: AnkiConnectClient,
          useValue: {
            invoke: jest.fn(),
          },
        },
      ],
    }).compile();

    tool = module.get<UpdateModelTemplatesTool>(UpdateModelTemplatesTool);
    ankiClient = module.get(AnkiConnectClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("updateModelTemplates", () => {
    it("should update model templates successfully", async () => {
      const modelName = "Basic";
      const templates = {
        "Card 1": {
          Front: "<div class='front'>{{Front}}</div>",
          Back: "{{FrontSide}}\n\n<hr id=answer>\n\n<div class='back'>{{Back}}</div>",
        },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        }) // modelTemplates pre-read
        .mockResolvedValueOnce(null); // updateModelTemplates write

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "modelTemplates", {
        modelName,
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(
        2,
        "updateModelTemplates",
        {
          model: {
            name: modelName,
            templates,
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.templateCount).toBe(1);
      expect(result.message).toContain(
        'Successfully updated 1 card template(s) for model "Basic"',
      );
    });

    it("should update multiple card templates", async () => {
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

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
          "Card 2": { Front: "{{Back}}", Back: "{{Front}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.templateCount).toBe(2);
      expect(result.message).toContain("2 card template(s)");
    });

    it("should update templates with HTML content", async () => {
      const modelName = "Styled";
      const templates = {
        "Card 1": {
          Front:
            '<div style="font-family: Arial; font-size: 20px;">{{Front}}</div>',
          Back: '<div class="card">{{FrontSide}}<hr id="answer"><div class="back">{{Back}}</div></div>',
        },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.templateCount).toBe(1);
    });

    it("should update templates with conditional replacements", async () => {
      const modelName = "Conditional";
      const templates = {
        "Card 1": {
          Front:
            "{{#Field}}<b>{{Field}}</b>{{/Field}}{{^Field}}<i>empty</i>{{/Field}}",
          Back: "{{FrontSide}}<hr>{{Back}}",
        },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
    });

    it("should update templates with very long HTML", async () => {
      const modelName = "LongContent";
      const longHtml = "<div>" + "x".repeat(5000) + "</div>";
      const templates = {
        "Card 1": { Front: longHtml, Back: "{{FrontSide}}" },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
    });

    it("should update Cloze model templates", async () => {
      const modelName = "Cloze";
      const templates = {
        "Card 1": {
          Front: "<div class='cloze'>{{cloze:Text}}</div>",
          Back: "<div class='cloze'>{{cloze:Text}}</div><br><div class='extra'>{{Extra}}</div>",
        },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
    });

    it("should handle model not found error", async () => {
      const modelName = "NonExistent";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockRejectedValueOnce(new Error("model not found"));

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.hint).toContain("Model not found");
    });

    it("should handle model does not exist error", async () => {
      const modelName = "Ghost";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockRejectedValueOnce(
        new Error("model does not exist"),
      );

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
    });

    it("should handle AnkiConnect connection errors", async () => {
      const modelName = "Basic";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockRejectedValueOnce(new Error("Anki is not running"));

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.hint).toContain("Anki is running");
    });

    it("should handle generic errors", async () => {
      const modelName = "Basic";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockRejectedValueOnce(new Error("Unknown error"));

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown error");
    });
  });

  describe("Pre-flight Card Name Validation", () => {
    it("should reject unknown card names and list valid templates without writing", async () => {
      const modelName = "Basic";
      const templates = {
        "Front Card": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce({
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      });

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Card template(s) not found in model "Basic": "Front Card"',
      );
      expect(result.error).toContain('Valid templates: "Card 1"');
      expect(result.hint).toContain('"Card 1"');

      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "updateModelTemplates",
        expect.anything(),
      );
    });

    it("should reject mis-cased card names (case-sensitive matching)", async () => {
      const modelName = "Basic";
      const templates = {
        "card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce({
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      });

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain('"card 1"');
      expect(result.hint).toContain("case-sensitive");
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should return model not found error when pre-read returns null", async () => {
      const modelName = "Ghost";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should return model not found error when pre-read returns empty object", async () => {
      const modelName = "Empty";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockResolvedValueOnce({});

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should proceed with the write when all card names are valid", async () => {
      const modelName = "Basic (and reversed card)";
      const templates = {
        "Card 2": { Front: "{{Back}}", Back: "{{Front}}" },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
          "Card 2": { Front: "{{Back}}", Back: "{{Front}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(
        2,
        "updateModelTemplates",
        {
          model: {
            name: modelName,
            templates,
          },
        },
      );
    });
  });

  describe("Response Structure - Success", () => {
    it("should return complete structure on success", async () => {
      const modelName = "Test Model";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("templateCount");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(true);
      expect(result.templateCount).toBe(1);
    });

    it("should include templateCount matching input", async () => {
      const modelName = "Test Model";
      const templates = {
        "Card 1": { Front: "A", Back: "B" },
        "Card 2": { Front: "C", Back: "D" },
        "Card 3": { Front: "E", Back: "F" },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
          "Card 2": { Front: "{{Front}}", Back: "{{Back}}" },
          "Card 3": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.templateCount).toBe(3);
    });

    it("should include helpful hint on success", async () => {
      const modelName = "Test Model";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke
        .mockResolvedValueOnce({
          "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
        })
        .mockResolvedValueOnce(null);

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.hint).toContain(
        "Template changes apply to all cards using this model",
      );
    });
  });

  describe("Response Structure - Error", () => {
    it("should return correct structure on error", async () => {
      const modelName = "Invalid";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(false);
    });

    it("should include model name in error response", async () => {
      const modelName = "Invalid Model";
      const templates = {
        "Card 1": { Front: "{{Front}}", Back: "{{Back}}" },
      };

      ankiClient.invoke.mockRejectedValueOnce(new Error("Test error"));

      const rawResult = await tool.updateModelTemplates({
        modelName,
        templates,
      });
      const result = parseToolResult(rawResult);

      expect(result.modelName).toBe(modelName);
    });
  });
});
