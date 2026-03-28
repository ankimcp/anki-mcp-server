import { Test, TestingModule } from "@nestjs/testing";
import { ModelNamesTool } from "../model-names.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createMockContext,
  parseToolResult,
} from "@/test-fixtures/test-helpers";

describe("ModelNamesTool", () => {
  let tool: ModelNamesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModelNamesTool,
        {
          provide: AnkiConnectClient,
          useValue: {
            invoke: jest.fn(),
          },
        },
      ],
    }).compile();

    tool = module.get<ModelNamesTool>(ModelNamesTool);
    ankiClient = module.get(AnkiConnectClient);
    mockContext = createMockContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Model Retrieval", () => {
    it("should return list of model names with built-in models", async () => {
      const modelNames = ["Basic", "Basic (and reversed card)", "Cloze"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(3);
      expect(result.message).toBe("Found 3 note types");
      expect(result.commonTypes.basic).toBe("Basic");
      expect(result.commonTypes.basicReversed).toBe(
        "Basic (and reversed card)",
      );
      expect(result.commonTypes.cloze).toBe("Cloze");
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelNames");
    });

    it("should return list with only custom models", async () => {
      const modelNames = [
        "Spanish Vocabulary",
        "Japanese Kanji",
        "Math Problems",
      ];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(3);
      expect(result.message).toBe("Found 3 note types");
      expect(result.commonTypes.basic).toBeNull();
      expect(result.commonTypes.basicReversed).toBeNull();
      expect(result.commonTypes.cloze).toBeNull();
    });

    it("should return mixed built-in and custom models", async () => {
      const modelNames = [
        "Basic",
        "Spanish Vocabulary",
        "Cloze",
        "Japanese Kanji",
        "Basic (and reversed card)",
      ];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(5);
      expect(result.message).toBe("Found 5 note types");
      expect(result.commonTypes.basic).toBe("Basic");
      expect(result.commonTypes.cloze).toBe("Cloze");
      expect(result.commonTypes.basicReversed).toBe(
        "Basic (and reversed card)",
      );
    });

    it("should handle single model", async () => {
      const modelNames = ["Basic"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(1);
      expect(result.message).toBe("Found 1 note types");
    });

    it("should handle many models (50+)", async () => {
      const modelNames = Array.from({ length: 75 }, (_, i) => `Model ${i + 1}`);

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(75);
      expect(result.message).toBe("Found 75 note types");
    });
  });

  describe("Common Model Type Detection", () => {
    it("should identify all common built-in model types", async () => {
      const modelNames = [
        "Basic",
        "Basic (and reversed card)",
        "Basic (type in the answer)",
        "Cloze",
      ];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.commonTypes.basic).toBe("Basic");
      expect(result.commonTypes.basicReversed).toBe(
        "Basic (and reversed card)",
      );
      expect(result.commonTypes.cloze).toBe("Cloze");
      // Note: "Basic (type in the answer)" is not tracked in commonTypes
    });

    it("should detect Basic model variations", async () => {
      const modelNames = ["Basic", "Basic (and reversed card)"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.commonTypes.basic).toBe("Basic");
      expect(result.commonTypes.basicReversed).toBe(
        "Basic (and reversed card)",
      );
      expect(result.commonTypes.cloze).toBeNull();
    });

    it("should not include custom models in commonTypes", async () => {
      const modelNames = [
        "Basic",
        "My Custom Model",
        "Cloze",
        "Another Custom",
      ];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.commonTypes.basic).toBe("Basic");
      expect(result.commonTypes.cloze).toBe("Cloze");
      // Custom models are in modelNames array but not in commonTypes object
      expect(result.modelNames).toContain("My Custom Model");
      expect(result.modelNames).toContain("Another Custom");
    });

    it("should return null commonTypes when no built-in models present", async () => {
      const modelNames = ["Custom Model 1", "Custom Model 2"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.commonTypes.basic).toBeNull();
      expect(result.commonTypes.basicReversed).toBeNull();
      expect(result.commonTypes.cloze).toBeNull();
    });
  });

  describe("Error Handling", () => {
    it("should handle AnkiConnect connection error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });

    it("should handle generic AnkiConnect error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Unknown error"));

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown error");
      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });

    it("should handle permission errors", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Permission denied"));

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });

    it("should handle timeout errors", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Request timeout"));

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Request timeout");
      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty model list", async () => {
      const modelNames: string[] = [];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe("No note types found in Anki");
      // commonTypes is always included (required by outputSchema) with null values
      expect(result.commonTypes).toEqual({
        basic: null,
        basicReversed: null,
        cloze: null,
      });
    });

    it("should handle null response from AnkiConnect", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe("No note types found in Anki");
    });

    it("should handle undefined response from AnkiConnect", async () => {
      ankiClient.invoke.mockResolvedValueOnce(undefined);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe("No note types found in Anki");
    });

    it("should handle model names with special characters", async () => {
      const modelNames = ["Model (v2.0)", "Model [Updated]", "Model & Notes"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(3);
    });

    it("should handle model names with unicode characters", async () => {
      const modelNames = ["日本語モデル", "Español", "Русский"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toEqual(modelNames);
      expect(result.total).toBe(3);
    });

    it("should handle very long model names", async () => {
      const longName = "A".repeat(500);
      const modelNames = [longName, "Basic"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.modelNames).toContain(longName);
      expect(result.total).toBe(2);
    });

    it("should handle duplicate model names (if AnkiConnect returns them)", async () => {
      const modelNames = ["Basic", "Basic", "Cloze"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.modelNames).toEqual(["Basic", "Basic", "Cloze"]);
    });
  });

  describe("Progress Reporting", () => {
    it("should report progress during retrieval", async () => {
      const modelNames = ["Basic", "Cloze"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      await tool.modelNames({}, mockContext);

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
      ankiClient.invoke.mockRejectedValueOnce(new Error("Failed"));

      await tool.modelNames({}, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe("Response Structure", () => {
    it("should return correct structure on success", async () => {
      const modelNames = ["Basic", "Cloze"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("modelNames");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("commonTypes");
      expect(result).toHaveProperty("message");
      expect(result.success).toBe(true);
    });

    it("should return correct structure on error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Connection error"));

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(false);
    });

    it("should not include hint on success", async () => {
      const modelNames = ["Basic", "Cloze"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).not.toHaveProperty("hint");
    });

    it("should include connection hint on error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Connection error"));

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });
  });

  describe("Message Content", () => {
    it("should include model count in success message", async () => {
      const modelNames = ["Basic", "Cloze", "Custom"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.message).toBe("Found 3 note types");
    });

    it("should use consistent message format", async () => {
      const modelNames = ["Basic", "Cloze"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.message).toBe("Found 2 note types");
    });

    it("should handle empty list message", async () => {
      const modelNames: string[] = [];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.message).toBe("No note types found in Anki");
    });

    it("should handle singular model count", async () => {
      const modelNames = ["Basic"];

      ankiClient.invoke.mockResolvedValueOnce(modelNames);

      const rawResult = await tool.modelNames({}, mockContext);
      const result = parseToolResult(rawResult);

      // Note: The actual implementation uses "note types" (plural) even for 1 model
      expect(result.message).toBe("Found 1 note types");
    });
  });
});
