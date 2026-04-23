import { Test, TestingModule } from "@nestjs/testing";
import { ModelFieldNamesTool } from "../model-field-names.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createMockContext,
  parseToolResult,
} from "@/test-fixtures/test-helpers";

describe("ModelFieldNamesTool", () => {
  let tool: ModelFieldNamesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelFieldNamesTool,
        {
          provide: AnkiConnectClient,
          useValue: {
            invoke: jest.fn(),
          },
        },
      ],
    }).compile();

    tool = module.get<ModelFieldNamesTool>(ModelFieldNamesTool);
    ankiClient = module.get(AnkiConnectClient);
    mockContext = createMockContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Built-in Models", () => {
    it("should return fields for Basic model", async () => {
      const modelName = "Basic";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.total).toBe(2);
      expect(result.message).toBe('Model "Basic" has 2 fields');
      expect(result.example).toEqual({
        Front: "Question or prompt text",
        Back: "Answer or response text",
      });
      expect(result.hint).toBe(
        "Use these field names as keys when creating notes with addNote tool",
      );
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: modelName,
      });
    });

    it("should return fields for Basic (and reversed card) model", async () => {
      const modelName = "Basic (and reversed card)";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.total).toBe(2);
      expect(result.example).toEqual({
        Front: "First side of the card",
        Back: "Second side of the card",
      });
    });

    it("should return fields for Basic (type in the answer) model", async () => {
      const modelName = "Basic (type in the answer)";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.example).toEqual({
        Front: "Question or prompt text",
        Back: "Answer or response text",
      });
    });

    it("should return fields for Cloze model", async () => {
      const modelName = "Cloze";
      const fieldNames = ["Text", "Back Extra"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.total).toBe(2);
      expect(result.example).toEqual({
        Text: "The {{c1::hidden}} text will be replaced with [...] on the card",
        "Back Extra": "Additional information or hints",
      });
    });
  });

  describe("Custom Models", () => {
    it("should return fields for custom vocabulary model", async () => {
      const modelName = "Spanish Vocabulary";
      const fieldNames = ["Spanish", "English", "Example", "Audio"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.total).toBe(4);
      // Custom models don't get examples
      expect(result.example).toBeUndefined();
      expect(result.hint).toBeUndefined();
    });

    it("should return fields for custom model with many fields", async () => {
      const modelName = "Comprehensive Card";
      const fieldNames = [
        "Field1",
        "Field2",
        "Field3",
        "Field4",
        "Field5",
        "Field6",
        "Field7",
        "Field8",
      ];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.total).toBe(8);
    });

    it("should return fields for model with single field", async () => {
      const modelName = "Minimal";
      const fieldNames = ["Content"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.fieldNames).toEqual(fieldNames);
      expect(result.total).toBe(1);
      expect(result.message).toBe('Model "Minimal" has 1 field');
    });

    it("should handle model with unicode field names", async () => {
      const modelName = "Japanese";
      const fieldNames = ["日本語", "English", "読み方"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.fieldNames).toEqual(fieldNames);
      // Custom models don't get examples
      expect(result.example).toBeUndefined();
    });
  });

  describe("Case Sensitivity", () => {
    it("should handle exact case match", async () => {
      const modelName = "MyModel";
      const fieldNames = ["Field1", "Field2"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: modelName,
      });
    });

    it("should pass case variations to AnkiConnect", async () => {
      const modelName = "BASIC";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      await tool.modelFieldNames({ modelName }, mockContext);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: modelName,
      });
    });
  });

  describe("Error Handling", () => {
    it("should handle model not found", async () => {
      const modelName = "NonExistent";

      ankiClient.invoke.mockRejectedValueOnce(new Error("model was not found"));

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("model was not found");
      expect(result.modelName).toBe(modelName);
      expect(result.hint).toBe(
        "Make sure the model name is correct and Anki is running",
      );
    });

    it("should handle AnkiConnect connection error", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.hint).toBe(
        "Make sure the model name is correct and Anki is running",
      );
    });

    it("should handle generic AnkiConnect error", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Unknown error"));

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown error");
    });

    it("should handle empty model name", async () => {
      const modelName = "";
      const fieldNames: string[] = [];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      await tool.modelFieldNames({ modelName }, mockContext);

      // AnkiConnect will handle validation, we just pass it through
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: modelName,
      });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty field list", async () => {
      const modelName = "EmptyModel";
      const fieldNames: string[] = [];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.fieldNames).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe('Model "EmptyModel" has no fields');
    });

    it("should handle null field list from AnkiConnect", async () => {
      const modelName = "NullModel";

      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Model "NullModel" not found');
      expect(result.modelName).toBe(modelName);
      expect(result.hint).toBe("Use modelNames tool to see available models");
    });

    it("should handle undefined field list from AnkiConnect", async () => {
      const modelName = "UndefinedModel";

      ankiClient.invoke.mockResolvedValueOnce(undefined);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Model "UndefinedModel" not found');
      expect(result.modelName).toBe(modelName);
      expect(result.hint).toBe("Use modelNames tool to see available models");
    });

    it("should handle model with special characters in name", async () => {
      const modelName = "Model (v2.0) [Updated]";
      const fieldNames = ["Field1", "Field2"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });

    it("should handle very long model name", async () => {
      const modelName = "A".repeat(200);
      const fieldNames = ["Field1"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelName).toBe(modelName);
    });
  });

  describe("Progress Reporting", () => {
    it("should report progress during retrieval", async () => {
      const modelName = "Basic";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      await tool.modelFieldNames({ modelName }, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 75,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(3);
    });

    it("should report progress even when retrieval fails", async () => {
      const modelName = "Basic";

      ankiClient.invoke.mockRejectedValueOnce(new Error("Failed"));

      await tool.modelFieldNames({ modelName }, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe("Example Generation", () => {
    it("should generate example for Basic model fields", async () => {
      const modelName = "Basic";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.example).toEqual({
        Front: "Question or prompt text",
        Back: "Answer or response text",
      });
    });

    it("should generate example for Cloze model", async () => {
      const modelName = "Cloze";
      const fieldNames = ["Text", "Back Extra"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.example).toEqual({
        Text: "The {{c1::hidden}} text will be replaced with [...] on the card",
        "Back Extra": "Additional information or hints",
      });
    });

    it("should not generate example for custom fields", async () => {
      const modelName = "Custom";
      const fieldNames = ["CustomField1", "CustomField2"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      // Custom models don't get examples
      expect(result.example).toBeUndefined();
      expect(result.hint).toBeUndefined();
    });
  });

  describe("Response Structure", () => {
    it("should return correct structure on success", async () => {
      const modelName = "Basic";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("fieldNames");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("example");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(true);
    });

    it("should return correct structure on error", async () => {
      const modelName = "NonExistent";

      ankiClient.invoke.mockRejectedValueOnce(new Error("model was not found"));

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("modelName");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(false);
    });

    it("should include helpful hint for success", async () => {
      const modelName = "Basic";
      const fieldNames = ["Front", "Back"];

      ankiClient.invoke.mockResolvedValueOnce(fieldNames);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.hint).toBe(
        "Use these field names as keys when creating notes with addNote tool",
      );
    });

    it("should include helpful hint for model not found error", async () => {
      const modelName = "NonExistent";

      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.modelFieldNames({ modelName }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.hint).toBe("Use modelNames tool to see available models");
    });
  });
});
