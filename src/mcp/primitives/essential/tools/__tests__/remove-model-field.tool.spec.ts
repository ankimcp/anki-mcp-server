import { Test, TestingModule } from "@nestjs/testing";
import { RemoveModelFieldTool } from "../remove-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("RemoveModelFieldTool", () => {
  let tool: RemoveModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RemoveModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RemoveModelFieldTool>(RemoveModelFieldTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("removeModelField", () => {
    it("should remove a field with confirmDeletion: true", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.removeModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldRemove", {
        modelName: "Basic",
        fieldName: "Grammar",
      });
      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Basic");
      expect(result.fieldName).toBe("Grammar");
      expect(result.message).toContain("deleted");
    });

    it("should refuse to remove without confirmDeletion", async () => {
      const rawResult = await tool.removeModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        confirmDeletion: false,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.hint).toContain("confirmDeletion: true");
    });

    it("should handle model not found error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("model not found"));

      const rawResult = await tool.removeModelField({
        modelName: "NonExistent",
        fieldName: "Grammar",
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model or field not found");
    });

    it("should handle field not found error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(
        new Error("field does not exist"),
      );

      const rawResult = await tool.removeModelField({
        modelName: "Basic",
        fieldName: "NonExistentField",
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model or field not found");
    });

    it("should handle generic AnkiConnect error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Anki not running"));

      const rawResult = await tool.removeModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Anki is running");
    });
  });
});
