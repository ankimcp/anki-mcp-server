import { Test, TestingModule } from "@nestjs/testing";
import { CreateModelTool } from "../create-model.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

// Mock the AnkiConnectClient
jest.mock("../../../../clients/anki-connect.client");

describe("CreateModelTool", () => {
  let tool: CreateModelTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreateModelTool, AnkiConnectClient],
    }).compile();

    tool = module.get<CreateModelTool>(CreateModelTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("createModel", () => {
    it("should create a basic model with minimal parameters", async () => {
      // Arrange
      const modelData = {
        modelName: "Test Basic",
        inOrderFields: ["Front", "Back"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}}",
            Back: "{{FrontSide}}<hr id=answer>{{Back}}",
          },
        ],
      };

      ankiClient.invoke.mockResolvedValueOnce({
        id: 1234567890,
        name: "Test Basic",
      });

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).toHaveBeenCalledWith("createModel", {
        modelName: "Test Basic",
        inOrderFields: ["Front", "Back"],
        cardTemplates: modelData.cardTemplates,
        css: undefined,
        isCloze: false,
      });

      expect(result.success).toBe(true);
      expect(result.modelName).toBe("Test Basic");
      expect(result.fields).toEqual(["Front", "Back"]);
      expect(result.templateCount).toBe(1);
      expect(result.hasCss).toBe(false);
      expect(result.isCloze).toBe(false);
    });

    it("should create a model with custom CSS (RTL example)", async () => {
      // Arrange
      const rtlCss = `.card {
  font-family: arial;
  font-size: 20px;
  text-align: right;
  color: black;
  background-color: white;
  direction: rtl;
}`;

      const modelData = {
        modelName: "Basic RTL",
        inOrderFields: ["Front", "Back"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}}",
            Back: "{{FrontSide}}<hr id=answer>{{Back}}",
          },
        ],
        css: rtlCss,
      };

      ankiClient.invoke.mockResolvedValueOnce({
        id: 9876543210,
        name: "Basic RTL",
      });

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("createModel", {
        modelName: "Basic RTL",
        inOrderFields: ["Front", "Back"],
        cardTemplates: modelData.cardTemplates,
        css: rtlCss,
        isCloze: false,
      });

      expect(result.success).toBe(true);
      expect(result.hasCss).toBe(true);
      expect(result.modelName).toBe("Basic RTL");
    });

    it("should create a cloze deletion model", async () => {
      // Arrange
      const modelData = {
        modelName: "Test Cloze",
        inOrderFields: ["Text", "Extra"],
        cardTemplates: [
          {
            Name: "Cloze",
            Front: "{{cloze:Text}}",
            Back: "{{cloze:Text}}<br>{{Extra}}",
          },
        ],
        isCloze: true,
      };

      ankiClient.invoke.mockResolvedValueOnce({
        id: 1111111111,
        name: "Test Cloze",
      });

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("createModel", {
        modelName: "Test Cloze",
        inOrderFields: ["Text", "Extra"],
        cardTemplates: modelData.cardTemplates,
        css: undefined,
        isCloze: true,
      });

      expect(result.success).toBe(true);
      expect(result.isCloze).toBe(true);
    });

    it("should create a model with multiple card templates", async () => {
      // Arrange
      const modelData = {
        modelName: "Test Multi-Card",
        inOrderFields: ["Front", "Back", "Extra"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}}",
            Back: "{{FrontSide}}<hr id=answer>{{Back}}",
          },
          {
            Name: "Card 2",
            Front: "{{Back}}",
            Back: "{{FrontSide}}<hr id=answer>{{Front}}<br>{{Extra}}",
          },
        ],
      };

      ankiClient.invoke.mockResolvedValueOnce({
        id: 2222222222,
        name: "Test Multi-Card",
      });

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.templateCount).toBe(2);
      expect(result.fields).toEqual(["Front", "Back", "Extra"]);
    });

    it("should warn about undefined field references in templates", async () => {
      // Arrange
      const modelData = {
        modelName: "Test Warnings",
        inOrderFields: ["Front", "Back"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}} {{UndefinedField}}",
            Back: "{{Back}} {{AnotherMissing}}",
          },
        ],
      };

      ankiClient.invoke.mockResolvedValueOnce({
        id: 3333333333,
        name: "Test Warnings",
      });

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("UndefinedField");
    });

    it("should not warn about special Anki fields", async () => {
      // Arrange
      const modelData = {
        modelName: "Test Special Fields",
        inOrderFields: ["Text"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Text}} - {{Tags}}",
            Back: "{{FrontSide}}<hr id=answer>{{Type}} {{Deck}}",
          },
        ],
      };

      ankiClient.invoke.mockResolvedValueOnce({
        id: 4444444444,
        name: "Test Special Fields",
      });

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.warnings).toBeUndefined();
    });

    it("should handle duplicate model name error", async () => {
      // Arrange
      const modelData = {
        modelName: "Existing Model",
        inOrderFields: ["Front", "Back"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}}",
            Back: "{{Back}}",
          },
        ],
      };

      ankiClient.invoke.mockRejectedValueOnce(
        new Error("Model already exists"),
      );

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.hint).toContain("already exists");
    });

    it("should handle AnkiConnect errors", async () => {
      // Arrange
      const modelData = {
        modelName: "Test Error",
        inOrderFields: ["Front"],
        cardTemplates: [
          {
            Name: "Card 1",
            Front: "{{Front}}",
            Back: "{{Front}}",
          },
        ],
      };

      ankiClient.invoke.mockRejectedValueOnce(new Error("Anki is not running"));

      // Act
      const rawResult = await tool.createModel(modelData);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.hint).toContain("Anki is running");
    });
  });
});
