import { Test, TestingModule } from "@nestjs/testing";
import { RepositionModelFieldTool } from "../reposition-model-field.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("RepositionModelFieldTool", () => {
  let tool: RepositionModelFieldTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RepositionModelFieldTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RepositionModelFieldTool>(RepositionModelFieldTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("repositionModelField", () => {
    it("should reposition a field successfully", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back", "Grammar"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldReposition

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 1,
      });
      const result = parseToolResult(rawResult);

      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldNames", {
        modelName: "Basic",
      });
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

    it("should reposition to index 0 (first field)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Latin", "English"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldReposition

      const rawResult = await tool.repositionModelField({
        modelName: "Latin Vocabulary",
        fieldName: "English",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.newIndex).toBe(0);
    });

    it("should reposition to the last valid index (field count - 1)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back", "Grammar"]); // modelFieldNames
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldReposition

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Front",
        index: 2,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.newIndex).toBe(2);
      expect(ankiClient.invoke).toHaveBeenCalledWith("modelFieldReposition", {
        modelName: "Basic",
        fieldName: "Front",
        index: 2,
      });
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

    it("should reject when the model has no fields (does not exist)", async () => {
      ankiClient.invoke.mockResolvedValueOnce([]); // modelFieldNames

      const rawResult = await tool.repositionModelField({
        modelName: "NonExistent",
        fieldName: "Grammar",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Model not found");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldReposition",
        expect.anything(),
      );
    });

    it("should reject when the field does not exist", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 0,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("modelFieldNames");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldReposition",
        expect.anything(),
      );
    });

    it("should reject an out-of-range index (pre-flight)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Front",
        index: 99,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("modelFieldNames");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldReposition",
        expect.anything(),
      );
    });

    it("should reject index equal to field count (must land on an existing slot)", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Front",
        index: 2,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("out of range");
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "modelFieldReposition",
        expect.anything(),
      );
    });

    it("should surface a write failure after a passing pre-flight", async () => {
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back", "Grammar"]); // modelFieldNames
      ankiClient.invoke.mockRejectedValueOnce(new Error("write failed")); // modelFieldReposition

      const rawResult = await tool.repositionModelField({
        modelName: "Basic",
        fieldName: "Grammar",
        index: 1,
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("write failed");
      expect(result.hint).toContain("Anki is running");
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
