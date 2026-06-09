import { Test, TestingModule } from "@nestjs/testing";
import { AddModelFieldTool } from "../add-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("AddModelFieldTool", () => {
  let tool: AddModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<AddModelFieldTool>(AddModelFieldTool);
    ankiClient = module.get(AnkiConnectClient) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("addModelField", () => {
    it("should add a field without index (append)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Grammar",
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldAdd", {
        modelName: "Basic",
        fieldName: "Grammar",
      });
      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Basic");
      expect(result.fieldName).toBe("Grammar");
      expect(result.index).toBeNull();
      expect(result.message).toContain("Grammar");
      expect(result.message).toContain("Basic");
    });

    it("should add a field at a specific index", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.addModelField({
        modelName: "Latin Vocabulary",
        fieldName: "IPA",
        index: 2,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldAdd", {
        modelName: "Latin Vocabulary",
        fieldName: "IPA",
        index: 2,
      });
      expect(result.success).toBe(true);
      expect(result.index).toBe(2);
      expect(result.message).toContain("position 2");
    });

    it("should add a field at index 0 (front)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "ID",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);
    });

    it("should handle model not found error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("model not found"));

      const rawResult = await tool.addModelField({
        modelName: "NonExistent",
        fieldName: "Grammar",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
    });

    it("should handle field already exists error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("field already exists"));

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Front",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("already exists");
    });

    it("should handle generic AnkiConnect error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Anki not running"));

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Grammar",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Anki is running");
    });

    it("should not include index in invoke params when undefined", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      await tool.addModelField({ modelName: "Basic", fieldName: "Test" });

      const call = ankiClient.invoke.mock.calls[0];
      expect(call[1]).not.toHaveProperty("index");
    });
  });
});
