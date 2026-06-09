import { Test, TestingModule } from "@nestjs/testing";
import { RenameModelFieldTool } from "../rename-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("RenameModelFieldTool", () => {
  let tool: RenameModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RenameModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RenameModelFieldTool>(RenameModelFieldTool);
    ankiClient = module.get(AnkiConnectClient) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("renameModelField", () => {
    it("should rename a field successfully", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "Grammar Notes",
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldRename", {
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "Grammar Notes",
      });
      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Basic");
      expect(result.oldFieldName).toBe("Notes");
      expect(result.newFieldName).toBe("Grammar Notes");
      expect(result.message).toContain("Notes");
      expect(result.message).toContain("Grammar Notes");
    });

    it("should include a template update warning in the response", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Front",
        newFieldName: "Question",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.warning).toContain("{{Front}}");
      expect(result.warning).toContain("{{Question}}");
      expect(result.warning).toContain("updateModelTemplates");
    });

    it("should handle model not found error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("model not found"));

      const rawResult = await tool.renameModelField({
        modelName: "NonExistent",
        oldFieldName: "Front",
        newFieldName: "Question",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model or field not found");
    });

    it("should handle new name already exists error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(
        new Error("field already exists"),
      );

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "Back",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Back");
      expect(result.hint).toContain("already exists");
    });

    it("should handle generic AnkiConnect error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Anki not running"));

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Front",
        newFieldName: "Question",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Anki is running");
    });
  });
});
