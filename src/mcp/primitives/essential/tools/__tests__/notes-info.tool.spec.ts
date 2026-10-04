import { Test, TestingModule } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { NotesInfoTool } from "../notes-info.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { MCP_TOOL_METADATA_KEY } from "@rekog/mcp-nest";
import { mockNotes } from "../../../../../test-fixtures/mock-data";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("NotesInfoTool", () => {
  let tool: NotesInfoTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotesInfoTool, AnkiConnectClient],
    }).compile();

    tool = module.get<NotesInfoTool>(NotesInfoTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    reflector = new Reflector();

    jest.clearAllMocks();
  });

  // Retrieves the tool's real outputSchema off the @Tool decorator metadata,
  // so success responses are validated the same way mcp-nest validates them
  // at runtime (see the `mod` regression this guards against, issue #66).
  function getOutputSchema(): {
    safeParse: (value: unknown) => { success: boolean };
  } {
    const options = reflector.get(MCP_TOOL_METADATA_KEY, tool.notesInfo) as any;
    return options.outputSchema;
  }

  describe("notesInfo", () => {
    it("should return note info with mod present and pass outputSchema validation", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([mockNotes.spanish]);

      // Act
      const rawResult = await tool.notesInfo({
        notes: [mockNotes.spanish.noteId],
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("notesInfo", {
        notes: [mockNotes.spanish.noteId],
      });
      expect(result.success).toBe(true);
      expect(result.notes[0].mod).toBe(mockNotes.spanish.mod);
      expect(getOutputSchema().safeParse(rawResult).success).toBe(true);
    });

    it("should pass outputSchema validation when AnkiConnect omits mod (older builds)", async () => {
      // Arrange: older AnkiConnect builds don't include `mod` in notesInfo
      const noteWithoutMod = { ...mockNotes.spanish } as Partial<
        typeof mockNotes.spanish
      >;
      delete noteWithoutMod.mod;
      ankiClient.invoke.mockResolvedValueOnce([noteWithoutMod]);

      // Act
      const rawResult = await tool.notesInfo({
        notes: [mockNotes.spanish.noteId],
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.notes[0].noteId).toBe(mockNotes.spanish.noteId);
      expect(result.notes[0].mod).toBeUndefined();
      expect(getOutputSchema().safeParse(rawResult).success).toBe(true);
    });

    it("should filter out not-found notes and count them in notFound", async () => {
      // Arrange: AnkiConnect returns {} entries for note IDs that don't exist
      ankiClient.invoke.mockResolvedValueOnce([mockNotes.spanish, {}]);

      // Act
      const rawResult = await tool.notesInfo({
        notes: [mockNotes.spanish.noteId, 9999999999],
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].noteId).toBe(mockNotes.spanish.noteId);
      expect(result.count).toBe(1);
      expect(result.notFound).toBe(1);
      expect(result.message).toContain("1 note(s) not found");
      expect(getOutputSchema().safeParse(rawResult).success).toBe(true);
    });

    it("should return an error response for an empty AnkiConnect response", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]);

      // Act
      const rawResult = await tool.notesInfo({ notes: [9999999999] });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("No note information found");
      expect(result.hint).toContain(
        "invalid or the notes may have been deleted",
      );
    });

    it("should return an error response for a null AnkiConnect response", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce(null as any);

      // Act
      const rawResult = await tool.notesInfo({ notes: [9999999999] });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("No note information found");
    });

    it("should handle network errors", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      // Act
      const rawResult = await tool.notesInfo({
        notes: [mockNotes.spanish.noteId],
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("fetch failed");
      expect(result.hint).toContain("Anki is not running");
    });
  });
});
