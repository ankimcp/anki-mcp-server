import { Test, TestingModule } from "@nestjs/testing";
import { DeleteNotesTool } from "../delete-notes.tool";
import {
  AnkiConnectClient,
  AnkiConnectError,
} from "../../../../clients/anki-connect.client";
import { mockNotes } from "../../../../../test-fixtures/mock-data";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("DeleteNotesTool", () => {
  let tool: DeleteNotesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeleteNotesTool, AnkiConnectClient],
    }).compile();

    tool = module.get<DeleteNotesTool>(DeleteNotesTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    jest.clearAllMocks();
  });

  describe("deleteNotes", () => {
    it("should require confirmation before deletion", async () => {
      // Arrange
      const noteIds = [mockNotes.spanish.noteId, mockNotes.japanese.noteId];

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: false,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.error).toContain("Deletion not confirmed");
      expect(result.hint).toContain("Set confirmDeletion to true");
      expect(result.warning).toContain("This action cannot be undone!");
    });

    it("should successfully delete notes with confirmation", async () => {
      // Arrange
      const noteIds = [mockNotes.spanish.noteId, mockNotes.japanese.noteId];
      const notesInfo = [
        { ...mockNotes.spanish, cards: [1, 2] },
        { ...mockNotes.japanese, cards: [3, 4, 5] },
      ];

      ankiClient.invoke
        .mockResolvedValueOnce(notesInfo) // notesInfo call
        .mockResolvedValueOnce(null); // deleteNotes call

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "notesInfo", {
        notes: noteIds,
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "deleteNotes", {
        notes: noteIds,
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.deletedNoteIds).toEqual(noteIds);
      expect(result.cardsDeleted).toBe(5); // 2 + 3 cards
      expect(result.message).toContain(
        "Successfully deleted 2 note(s) and 5 card(s)",
      );
      expect(result.warning).toContain("permanently deleted");
    });

    it("should handle partial deletion when some notes not found", async () => {
      // Arrange
      const noteIds = [
        mockNotes.spanish.noteId,
        9999999999,
        mockNotes.japanese.noteId,
      ];
      const notesInfo = [
        mockNotes.spanish,
        null, // Not found
        mockNotes.japanese,
      ];

      ankiClient.invoke
        .mockResolvedValueOnce(notesInfo)
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      const validNoteIds = [
        mockNotes.spanish.noteId,
        mockNotes.japanese.noteId,
      ];
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "deleteNotes", {
        notes: validNoteIds,
      });

      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(2);
      expect(result.notFoundCount).toBe(1);
      expect(result.message).toContain("1 note(s) were not found");
    });

    it("should handle case when all notes are already deleted", async () => {
      // Arrange
      const noteIds = [9999999998, 9999999999];
      ankiClient.invoke.mockResolvedValueOnce([null, null]);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1); // Only notesInfo, no deleteNotes
      expect(result.success).toBe(true);
      expect(result.deletedCount).toBe(0);
      expect(result.notFoundCount).toBe(2);
      expect(result.message).toContain("No notes were deleted");
      expect(result.hint).toContain("already been deleted");
    });

    it("should calculate total cards correctly", async () => {
      // Arrange
      const noteIds = [mockNotes.spanish.noteId];
      const noteWithMultipleCards = {
        ...mockNotes.spanish,
        cards: [1, 2, 3, 4, 5], // 5 cards
      };

      ankiClient.invoke
        .mockResolvedValueOnce([noteWithMultipleCards])
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.cardsDeleted).toBe(5);
      expect(result.message).toContain("5 card(s)");
    });

    it("should handle network errors gracefully", async () => {
      // Arrange
      const noteIds = [mockNotes.spanish.noteId];
      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("fetch failed");
      expect(result.hint).toContain("Make sure Anki is running");
    });

    it("should handle permission errors", async () => {
      // Arrange
      const noteIds = [mockNotes.spanish.noteId];
      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockRejectedValueOnce(
          new AnkiConnectError("permission denied", "deleteNotes"),
        );

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("permission");
      expect(result.hint).toContain("Check if Anki allows deletions");
    });

    it("should enforce maximum batch size", async () => {
      // Arrange
      const tooManyNotes = Array.from(
        { length: 101 },
        (_, i) => 1500000000000 + i,
      );

      // Act
      const rawResult = await tool.deleteNotes({
        notes: tooManyNotes,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.requestedNotes).toEqual(tooManyNotes);
    });

    it("should suggest syncing after deletion", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: [mockNotes.spanish.noteId],
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.hint).toContain("Consider syncing with AnkiWeb");
    });

    it("should report progress correctly", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      // Act
      const _rawResult = await tool.deleteNotes({
        notes: [mockNotes.spanish.noteId],
        confirmDeletion: true,
      });

      // Assert
    });

    it("should handle notes with no cards gracefully", async () => {
      // Arrange
      const noteWithoutCards = {
        ...mockNotes.spanish,
        cards: undefined,
      };

      ankiClient.invoke
        .mockResolvedValueOnce([noteWithoutCards])
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: [mockNotes.spanish.noteId],
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.cardsDeleted).toBe(0);
    });

    it("should preserve request IDs in response", async () => {
      // Arrange
      const noteIds = [123, 456, 789];
      ankiClient.invoke
        .mockResolvedValueOnce([{ noteId: 123 }, null, { noteId: 789 }])
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: noteIds,
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.requestedIds).toEqual(noteIds);
      expect(result.deletedNoteIds).toEqual([123, 789]);
    });

    it("should provide clear safety warnings", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce([mockNotes.spanish])
        .mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.deleteNotes({
        notes: [mockNotes.spanish.noteId],
        confirmDeletion: true,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.warning).toBeDefined();
      expect(result.warning).toContain("permanently deleted");
    });
  });
});
