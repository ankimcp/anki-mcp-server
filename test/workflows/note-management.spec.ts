import { Test, TestingModule } from "@nestjs/testing";
import { AnkiConnectClient } from "../../src/mcp/clients/anki-connect.client";
import { AddNoteTool } from "../../src/mcp/primitives/essential/tools/add-note.tool";
import { FindNotesTool } from "../../src/mcp/primitives/essential/tools/find-notes.tool";
import { NotesInfoTool } from "../../src/mcp/primitives/essential/tools/notes-info.tool";
import { UpdateNoteFieldsTool } from "../../src/mcp/primitives/essential/tools/update-note-fields.tool";
import { DeleteNotesTool } from "../../src/mcp/primitives/essential/tools/delete-notes.tool";
import {
  parseToolResult,
  createMockContext,
} from "../../src/test-fixtures/test-helpers";

jest.mock("../../src/mcp/clients/anki-connect.client");

describe("Note Management Workflow", () => {
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let addNoteTool: AddNoteTool;
  let findNotesTool: FindNotesTool;
  let notesInfoTool: NotesInfoTool;
  let updateNoteFieldsTool: UpdateNoteFieldsTool;
  let deleteNotesTool: DeleteNotesTool;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnkiConnectClient,
        AddNoteTool,
        FindNotesTool,
        NotesInfoTool,
        UpdateNoteFieldsTool,
        DeleteNotesTool,
      ],
    }).compile();

    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    addNoteTool = module.get<AddNoteTool>(AddNoteTool);
    findNotesTool = module.get<FindNotesTool>(FindNotesTool);
    notesInfoTool = module.get<NotesInfoTool>(NotesInfoTool);
    updateNoteFieldsTool =
      module.get<UpdateNoteFieldsTool>(UpdateNoteFieldsTool);
    deleteNotesTool = module.get<DeleteNotesTool>(DeleteNotesTool);

    mockContext = createMockContext();

    jest.clearAllMocks();
  });

  describe("Complete Note Lifecycle", () => {
    it("should complete full CRUD workflow for a note", async () => {
      // Test data
      const newNoteId = 1234567890;
      const noteData = {
        deckName: "TestDeck",
        modelName: "Basic",
        fields: {
          Front: "Test Question",
          Back: "Test Answer",
        },
        tags: ["test", "workflow"],
      };

      const updatedFields = {
        Front: "Updated Question",
        Back: "Updated Answer",
      };

      // Step 1: Add a new note
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "modelFieldNames") {
            return ["Front", "Back"];
          }
          if (action === "addNote") {
            return newNoteId;
          }
          return null;
        },
      );

      const addRawResult = await addNoteTool.addNote(noteData, mockContext);
      const addResult = parseToolResult(addRawResult);
      expect(addResult.success).toBe(true);
      expect(addResult.noteId).toBe(newNoteId);

      // Step 2: Find the note
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "findNotes") {
            return [newNoteId];
          }
          return null;
        },
      );

      const findRawResult = await findNotesTool.findNotes(
        { query: `deck:${noteData.deckName}` },
        mockContext,
      );
      const findResult = parseToolResult(findRawResult);
      expect(findResult.success).toBe(true);
      expect(findResult.noteIds).toContain(newNoteId);

      // Step 3: Get note information
      const noteInfo = {
        noteId: newNoteId,
        modelName: noteData.modelName,
        fields: {
          Front: { value: noteData.fields.Front, order: 0 },
          Back: { value: noteData.fields.Back, order: 1 },
        },
        tags: noteData.tags,
        cards: [newNoteId + 1],
        mod: Date.now(),
      };

      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return [noteInfo];
          }
          return null;
        },
      );

      const infoRawResult = await notesInfoTool.notesInfo(
        { notes: [newNoteId] },
        mockContext,
      );
      const infoResult = parseToolResult(infoRawResult);
      expect(infoResult.success).toBe(true);
      expect(infoResult.notes).toHaveLength(1);
      expect(infoResult.notes[0].noteId).toBe(newNoteId);

      // Step 4: Update the note
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return [noteInfo];
          }
          if (action === "updateNoteFields") {
            // Update the noteInfo for future calls
            noteInfo.fields.Front.value = updatedFields.Front;
            noteInfo.fields.Back.value = updatedFields.Back;
            return null;
          }
          return null;
        },
      );

      const updateRawResult = await updateNoteFieldsTool.updateNoteFields(
        {
          note: {
            id: newNoteId,
            fields: updatedFields,
          },
        },
        mockContext,
      );
      const updateResult = parseToolResult(updateRawResult);
      expect(updateResult.success).toBe(true);
      expect(updateResult.updatedFields).toEqual(["Front", "Back"]);

      // Step 5: Verify the update
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return [
              {
                ...noteInfo,
                fields: {
                  Front: { value: updatedFields.Front, order: 0 },
                  Back: { value: updatedFields.Back, order: 1 },
                },
              },
            ];
          }
          return null;
        },
      );

      const verifyRawResult = await notesInfoTool.notesInfo(
        { notes: [newNoteId] },
        mockContext,
      );
      const verifyResult = parseToolResult(verifyRawResult);
      expect(verifyResult.notes[0].fields.Front.value).toBe(
        updatedFields.Front,
      );
      expect(verifyResult.notes[0].fields.Back.value).toBe(updatedFields.Back);

      // Step 6: Delete the note
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return [noteInfo];
          }
          if (action === "deleteNotes") {
            return null;
          }
          return null;
        },
      );

      const deleteRawResult = await deleteNotesTool.deleteNotes(
        {
          notes: [newNoteId],
          confirmDeletion: true,
        },
        mockContext,
      );
      const deleteResult = parseToolResult(deleteRawResult);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.deletedNoteIds).toContain(newNoteId);

      // Step 7: Verify deletion
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "findNotes") {
            return []; // Note no longer exists
          }
          return null;
        },
      );

      const finalSearchRawResult = await findNotesTool.findNotes(
        { query: `deck:${noteData.deckName}` },
        mockContext,
      );
      const finalSearchResult = parseToolResult(finalSearchRawResult);
      expect(finalSearchResult.noteIds).not.toContain(newNoteId);
    });

    it("should handle batch operations workflow", async () => {
      // Test batch operations with multiple notes
      const noteIds = [1001, 1002, 1003];
      const notesData = noteIds.map((id) => ({
        noteId: id,
        modelName: "Basic",
        fields: {
          Front: { value: `Question ${id}`, order: 0 },
          Back: { value: `Answer ${id}`, order: 1 },
        },
        tags: ["batch"],
        cards: [id + 1000],
        mod: Date.now(),
      }));

      // Step 1: Find multiple notes
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "findNotes") {
            return noteIds;
          }
          return null;
        },
      );

      const findRawResult = await findNotesTool.findNotes(
        { query: "tag:batch" },
        mockContext,
      );
      const findResult = parseToolResult(findRawResult);
      expect(findResult.noteIds).toEqual(noteIds);

      // Step 2: Get information for all notes
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return notesData;
          }
          return null;
        },
      );

      const infoRawResult = await notesInfoTool.notesInfo(
        { notes: noteIds },
        mockContext,
      );
      const infoResult = parseToolResult(infoRawResult);
      expect(infoResult.notes).toHaveLength(3);

      // Step 3: Update all notes
      for (let i = 0; i < noteIds.length; i++) {
        ankiClient.invoke.mockImplementation(
          async (action: string, _params?: any) => {
            if (action === "notesInfo") {
              return [notesData[i]];
            }
            if (action === "updateNoteFields") {
              return null;
            }
            return null;
          },
        );

        const updateRawResult = await updateNoteFieldsTool.updateNoteFields(
          {
            note: {
              id: noteIds[i],
              fields: { Back: `Updated Answer ${noteIds[i]}` },
            },
          },
          mockContext,
        );
        const updateResult = parseToolResult(updateRawResult);
        expect(updateResult.success).toBe(true);
      }

      // Step 4: Delete all notes
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return notesData;
          }
          if (action === "deleteNotes") {
            return null;
          }
          return null;
        },
      );

      const deleteRawResult = await deleteNotesTool.deleteNotes(
        {
          notes: noteIds,
          confirmDeletion: true,
        },
        mockContext,
      );
      const deleteResult = parseToolResult(deleteRawResult);
      expect(deleteResult.deletedCount).toBe(3);
      expect(deleteResult.cardsDeleted).toBe(3);
    });

    it("should handle error recovery in workflow", async () => {
      const noteId = 2001;

      // Step 1: Try to update a non-existent note
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return []; // Note not found
          }
          return null;
        },
      );

      const updateRawResult = await updateNoteFieldsTool.updateNoteFields(
        {
          note: {
            id: noteId,
            fields: { Front: "Test" },
          },
        },
        mockContext,
      );
      const updateResult = parseToolResult(updateRawResult);
      expect(updateResult.success).toBe(false);
      expect(updateResult.error).toContain("Note not found");

      // Step 2: Create the note first
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "modelFieldNames") {
            return ["Front", "Back"];
          }
          if (action === "addNote") {
            return noteId;
          }
          return null;
        },
      );

      const addRawResult = await addNoteTool.addNote(
        {
          deckName: "RecoveryDeck",
          modelName: "Basic",
          fields: {
            Front: "Recovery Question",
            Back: "Recovery Answer",
          },
        },
        mockContext,
      );
      const addResult = parseToolResult(addRawResult);
      expect(addResult.success).toBe(true);

      // Step 3: Now update should work
      const noteInfo = {
        noteId: noteId,
        modelName: "Basic",
        fields: {
          Front: { value: "Recovery Question", order: 0 },
          Back: { value: "Recovery Answer", order: 1 },
        },
        tags: [],
        cards: [noteId + 1000],
        mod: Date.now(),
      };

      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "notesInfo") {
            return [noteInfo];
          }
          if (action === "updateNoteFields") {
            return null;
          }
          return null;
        },
      );

      const retryUpdateRawResult = await updateNoteFieldsTool.updateNoteFields(
        {
          note: {
            id: noteId,
            fields: { Front: "Updated Recovery Question" },
          },
        },
        mockContext,
      );
      const retryUpdateResult = parseToolResult(retryUpdateRawResult);
      expect(retryUpdateResult.success).toBe(true);
    });

    it("should handle search and filter workflow", async () => {
      // Setup mock data with different tags and decks
      // Step 1: Search with different queries
      const queries = [
        { query: "deck:Spanish", expectedIds: [3001, 3002] },
        { query: "tag:verb", expectedIds: [3002, 3003] },
        { query: "is:due", expectedIds: [3001, 3004] },
        { query: "deck:Spanish tag:verb", expectedIds: [3002] },
      ];

      for (const testCase of queries) {
        ankiClient.invoke.mockImplementation(
          async (action: string, params?: any) => {
            if (action === "findNotes" && params?.query === testCase.query) {
              return testCase.expectedIds;
            }
            return [];
          },
        );

        const rawResult = await findNotesTool.findNotes(
          { query: testCase.query },
          mockContext,
        );
        const result = parseToolResult(rawResult);
        expect(result.noteIds).toEqual(testCase.expectedIds);
      }
    });
  });
});
