import { Test, TestingModule } from "@nestjs/testing";
import { GuiEditNoteTool } from "../gui-edit-note.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiEditNoteTool", () => {
  let tool: GuiEditNoteTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiEditNoteTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiEditNoteTool>(GuiEditNoteTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiEditNote", () => {
    it("should successfully open note editor", async () => {
      mockAnkiClient.invoke.mockResolvedValue(null);

      const rawResult = await tool.guiEditNote({ note: 1234567890 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.noteId).toBe(1234567890);
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiEditNote", {
        note: 1234567890,
      });
    });

    it("should handle note not found error", async () => {
      const error = new Error("Note not found");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiEditNote({ note: 9999999999 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Note not found");
      expect(result.hint).toContain("Use findNotes");
    });

    it("should handle general errors", async () => {
      const error = new Error("Anki not responding");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiEditNote({ note: 1234567890 });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.hint).toContain("Make sure Anki is running");
    });
  });
});
