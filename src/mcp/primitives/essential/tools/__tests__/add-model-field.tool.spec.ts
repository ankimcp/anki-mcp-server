import { Test, TestingModule } from "@nestjs/testing";
import { AddModelFieldTool } from "../add-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("AddModelFieldTool", () => {
  let tool: AddModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<AddModelFieldTool>(AddModelFieldTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("addModelField", () => {
    it("should add a field without index (append)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldAdd

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Grammar",
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: "Basic",
      });
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
      ankiClient.invoke.mockResolvedValueOnce(["Latin", "English"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldAdd

      const rawResult = await tool.addModelField({
        modelName: "Latin Vocabulary",
        fieldName: "IPA",
        index: 1,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldAdd", {
        modelName: "Latin Vocabulary",
        fieldName: "IPA",
        index: 1,
      });
      expect(result.success).toBe(true);
      expect(result.index).toBe(1);
      expect(result.message).toContain("position 1");
    });

    it("should add a field at index 0 (front)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldAdd

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "ID",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.index).toBe(0);
    });

    it("should allow index equal to field count (append boundary)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldAdd

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 2,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.index).toBe(2);
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldAdd", {
        modelName: "Basic",
        fieldName: "Grammar",
        index: 2,
      });
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

    it("should reject when the model has no fields (does not exist)", async () => {
      ankiClient.invoke.mockResolvedValueOnce([]); // modelFieldNames

      const rawResult = await tool.addModelField({
        modelName: "NonExistent",
        fieldName: "Grammar",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldAdd",
        expect.anything(),
      );
    });

    it("should reject when the field already exists (pre-flight)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Front",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("already exists");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldAdd",
        expect.anything(),
      );
    });

    it("should reject a case-variant collision with an existing field", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "front",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("only in case");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldAdd",
        expect.anything(),
      );
    });

    it("should reject an out-of-range index (pre-flight)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 5,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("modelFieldNames");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldAdd",
        expect.anything(),
      );
    });

    it("should surface a write failure after a passing pre-flight", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockRejectedValueOnce(new Error("write failed")); // modelFieldAdd

      const rawResult = await tool.addModelField({
        modelName: "Basic",
        fieldName: "Grammar",
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("write failed");
      expect(result.hint).toContain("Anki is running");
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
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldAdd

      await tool.addModelField({ modelName: "Basic", fieldName: "Test" });

      const call = ankiClient.invoke.mock.calls[1];
      expect(call[0]).toBe("modelFieldAdd");
      expect(call[1]).not.toHaveProperty("index");
    });
  });
});
