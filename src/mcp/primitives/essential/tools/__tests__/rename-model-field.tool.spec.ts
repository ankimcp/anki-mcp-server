import { Test, TestingModule } from "@nestjs/testing";
import { RenameModelFieldTool } from "../rename-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("RenameModelFieldTool", () => {
  let tool: RenameModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RenameModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RenameModelFieldTool>(RenameModelFieldTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("renameModelField", () => {
    it("should rename a field successfully", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back", "Notes"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldRename

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "Grammar Notes",
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: "Basic",
      });
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
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldRename

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

    it("should reject when the model has no fields (does not exist)", async () => {
      ankiClient.invoke.mockResolvedValueOnce([]); // modelFieldNames

      const rawResult = await tool.renameModelField({
        modelName: "NonExistent",
        oldFieldName: "Front",
        newFieldName: "Question",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldRename",
        expect.anything(),
      );
    });

    it("should reject when the old field does not exist", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "Grammar Notes",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("modelFieldNames");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldRename",
        expect.anything(),
      );
    });

    it("should reject a no-op rename (old name equals new name) without any network call", async () => {
      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Front",
        newFieldName: "Front",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("identical");
      expect(ankiClient.invoke).not.toHaveBeenCalled();
    });

    it("should reject when the new name already exists (pre-flight)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back", "Notes"]); // modelFieldNames

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "Back",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Back");
      expect(result.hint).toContain("already exists");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldRename",
        expect.anything(),
      );
    });

    it("should reject a case-variant collision with a different field", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back", "Notes"]); // modelFieldNames

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Notes",
        newFieldName: "back",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("only in case");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldRename",
        expect.anything(),
      );
    });

    it("should reject a case change that collides with a different case-variant field", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Foo", "foo"]); // modelFieldNames

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Foo",
        newFieldName: "FOO",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("only in case");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldRename",
        expect.anything(),
      );
    });

    it("should allow a pure case change of the same field", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldRename

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Front",
        newFieldName: "front",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldRename", {
        modelName: "Basic",
        oldFieldName: "Front",
        newFieldName: "front",
      });
    });

    it("should surface a write failure after a passing pre-flight", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockRejectedValueOnce(new Error("write failed")); // modelFieldRename

      const rawResult = await tool.renameModelField({
        modelName: "Basic",
        oldFieldName: "Front",
        newFieldName: "Question",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("write failed");
      expect(result.hint).toContain("Anki is running");
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
