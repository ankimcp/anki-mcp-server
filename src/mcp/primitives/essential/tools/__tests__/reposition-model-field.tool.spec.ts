import { Test, TestingModule } from "@nestjs/testing";
import { RepositionModelFieldTool } from "../reposition-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("RepositionModelFieldTool", () => {
  let tool: RepositionModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RepositionModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RepositionModelFieldTool>(RepositionModelFieldTool);
    ankiClient = module.get(AnkiConnectClient) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("repositionModelField", () => {
    it("should reposition a field successfully", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 1,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldReposition", {
        modelName: "Basic",
        fieldName: "Grammar",
        index: 1,
      });
      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Basic");
      expect(result.fieldName).toBe("Grammar");
      expect(result.newIndex).toBe(1);
      expect(result.message).toContain("position 1");
    });

    it("should reposition to index 0 (first/sort field)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.repositionModelField({
        modelName: "Latin Vocabulary",
        fieldName: "Latin",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.newIndex).toBe(0);
    });

    it("should handle model not found error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("model not found"));

      const rawResult = await tool.repositionModelField({
        modelName: "NonExistent",
        fieldName: "Grammar",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model or field not found");
    });

    it("should handle index out of range error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("index out of range"));

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 99,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("modelFieldNames");
    });

    it("should handle generic AnkiConnect error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Anki not running"));

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 1,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Anki is running");
    });
  });
});
