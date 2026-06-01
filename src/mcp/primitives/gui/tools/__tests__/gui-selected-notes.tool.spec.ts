import { Test, TestingModule } from "@nestjs/testing";
import { GuiSelectedNotesTool } from "../gui-selected-notes.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiSelectedNotesTool", () => {
  let tool: GuiSelectedNotesTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiSelectedNotesTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiSelectedNotesTool>(GuiSelectedNotesTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiSelectedNotes", () => {
    it("should successfully return selected note IDs", async () => {
      const mockNoteIds = [1234567890, 9876543210, 5555555555];
      mockAnkiClient.invoke.mockResolvedValue(mockNoteIds);

      const rawResult = await tool.guiSelectedNotes({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual(mockNoteIds);
      expect(result.noteCount).toBe(3);
      expect(result.message).toContain("3 selected note");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiSelectedNotes");
    });

    it("should handle no selection (empty array)", async () => {
      mockAnkiClient.invoke.mockResolvedValue([]);

      const rawResult = await tool.guiSelectedNotes({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual([]);
      expect(result.noteCount).toBe(0);
      expect(result.message).toContain("No notes are currently selected");
      expect(result.hint).toContain("Open the Card Browser");
    });

    it("should handle browser not open error", async () => {
      const error = new Error("Card browser is not open");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiSelectedNotes({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("browser");
      expect(result.hint).toContain("Use guiBrowse");
    });

    it("should handle general errors", async () => {
      const error = new Error("Anki connection lost");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiSelectedNotes({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Anki connection lost");
      expect(result.hint).toContain("Make sure Anki is running");
    });
  });
});
