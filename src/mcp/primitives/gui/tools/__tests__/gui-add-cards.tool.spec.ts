import { Test, TestingModule } from "@nestjs/testing";
import { GuiAddCardsTool } from "../gui-add-cards.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiAddCardsTool", () => {
  let tool: GuiAddCardsTool;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiAddCardsTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiAddCardsTool>(GuiAddCardsTool);
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiAddCards", () => {
    const validNote = {
      deckName: "Spanish",
      modelName: "Basic",
      fields: {
        Front: "Hola",
        Back: "Hello",
      },
      tags: ["greeting"],
    };

    it("should successfully open Add Cards dialog", async () => {
      mockAnkiClient.invoke.mockResolvedValue(1234567890);

      const rawResult = await tool.guiAddCards(
        { note: validNote },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.noteId).toBe(1234567890);
      expect(result.deckName).toBe("Spanish");
      expect(result.modelName).toBe("Basic");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiAddCards", {
        note: validNote,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(3);
    });

    it("should handle empty field values", async () => {
      const noteWithEmptyField = {
        ...validNote,
        fields: {
          Front: "Question",
          Back: "",
        },
      };

      const rawResult = await tool.guiAddCards(
        { note: noteWithEmptyField },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Fields cannot be empty");
      expect(result.emptyFields).toContain("Back");
    });

    it("should handle model not found error", async () => {
      const error = new Error('Model "InvalidModel" not found');
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiAddCards(
        { note: validNote },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Model");
      expect(result.hint).toContain("Use modelNames");
    });

    it("should handle deck not found error", async () => {
      const error = new Error("Deck not found");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiAddCards(
        { note: validNote },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Use listDecks");
    });

    it("should handle field mismatch error", async () => {
      const error = new Error('Field "InvalidField" not found in model');
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiAddCards(
        { note: validNote },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Use modelFieldNames");
    });
  });
});
