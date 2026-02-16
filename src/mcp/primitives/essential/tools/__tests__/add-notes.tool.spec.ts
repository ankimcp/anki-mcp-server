import { Test, TestingModule } from "@nestjs/testing";
import { AddNotesTool } from "../add-notes.tool";
import {
  AnkiConnectClient,
  AnkiConnectError,
  ReadOnlyModeError,
} from "../../../../clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client", () => {
  const actual = jest.requireActual("../../../../clients/anki-connect.client");
  return {
    ...actual,
    AnkiConnectClient: jest.fn().mockImplementation(() => ({
      invoke: jest.fn(),
    })),
  };
});

async function createTestModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [AddNotesTool, AnkiConnectClient],
  }).compile();

  return {
    tool: module.get<AddNotesTool>(AddNotesTool),
    ankiClient: module.get(AnkiConnectClient) as jest.Mocked<AnkiConnectClient>,
  };
}

describe("AddNotesTool", () => {
  let tool: AddNotesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const testModule = await createTestModule();
    tool = testModule.tool;
    ankiClient = testModule.ankiClient;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  describe("addNotes", () => {
    it("should create all notes successfully (happy path)", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001) // addNote #1
        .mockResolvedValueOnce(1002) // addNote #2
        .mockResolvedValueOnce(1003); // addNote #3

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          tags: ["vocab"],
          notes: [
            { fields: { Front: "hola", Back: "hello" } },
            { fields: { Front: "gato", Back: "cat" } },
            { fields: { Front: "perro", Back: "dog" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.deckName).toBe("Spanish");
      expect(result.modelName).toBe("Basic");
      expect(result.totalRequested).toBe(3);
      expect(result.created).toBe(3);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({
        index: 0,
        status: "created",
        noteId: 1001,
      });
      expect(result.results[1]).toEqual({
        index: 1,
        status: "created",
        noteId: 1002,
      });
      expect(result.results[2]).toEqual({
        index: 2,
        status: "created",
        noteId: 1003,
      });

      // Verify addNote calls
      expect(ankiClient.invoke).toHaveBeenCalledTimes(4); // 1 modelFieldNames + 3 addNote
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "modelFieldNames", {
        modelName: "Basic",
      });

      // Verify payload sent to addNote for first note
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "addNote", {
        note: {
          deckName: "Spanish",
          modelName: "Basic",
          fields: { Front: "hola", Back: "hello" },
          tags: ["vocab"],
        },
      });

      // Verify payload sent to addNote for second note
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "addNote", {
        note: {
          deckName: "Spanish",
          modelName: "Basic",
          fields: { Front: "gato", Back: "cat" },
          tags: ["vocab"],
        },
      });
    });

    it("should handle partial success with duplicates", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001) // addNote #1 - success
        .mockResolvedValueOnce(null) // addNote #2 - duplicate (returns null)
        .mockResolvedValueOnce(1003); // addNote #3 - success

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "hola", Back: "hello" } },
            { fields: { Front: "existing", Back: "note" } },
            { fields: { Front: "perro", Back: "dog" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.created).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.results[1]).toEqual({
        index: 1,
        status: "skipped",
        reason: "duplicate",
      });
    });

    it("should handle mixed-status batch (created + skipped + failed)", async () => {
      // Arrange: 3 notes - first succeeds, second is duplicate (null), third throws
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001) // addNote #1 - success
        .mockResolvedValueOnce(null) // addNote #2 - duplicate
        .mockRejectedValueOnce(
          new AnkiConnectError("field value mismatch", "addNote"),
        ); // addNote #3 - error

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "good", Back: "note" } },
            { fields: { Front: "dup", Back: "note" } },
            { fields: { Front: "bad", Back: "note" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.success).toBe(true); // at least one created
      expect(result.results[0]).toEqual({
        index: 0,
        status: "created",
        noteId: 1001,
      });
      expect(result.results[1]).toEqual({
        index: 1,
        status: "skipped",
        reason: "duplicate",
      });
      expect(result.results[2]).toEqual({
        index: 2,
        status: "failed",
        error: expect.stringContaining("field value mismatch"),
      });
    });

    it("should handle all notes failing (all duplicates)", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(null) // duplicate
        .mockResolvedValueOnce(null); // duplicate

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "dup1", Back: "dup1" } },
            { fields: { Front: "dup2", Back: "dup2" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true); // all skipped is not a failure
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.failed).toBe(0);
    });

    it("should handle all notes failing with errors", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockRejectedValueOnce(new AnkiConnectError("field error", "addNote"))
        .mockRejectedValueOnce(
          new AnkiConnectError("another error", "addNote"),
        );

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "q1", Back: "a1" } },
            { fields: { Front: "q2", Back: "a2" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.results[0].status).toBe("failed");
      expect(result.results[1].status).toBe("failed");
    });

    it("should handle a single note in batch", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(9999); // addNote

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Default",
          modelName: "Basic",
          notes: [{ fields: { Front: "solo", Back: "single" } }],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.totalRequested).toBe(1);
      expect(result.created).toBe(1);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].noteId).toBe(9999);
    });

    it("should bubble up ReadOnlyModeError from AnkiConnectClient", async () => {
      // Arrange - modelFieldNames is a read operation, so it succeeds.
      // The first addNote call will throw ReadOnlyModeError.
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockRejectedValueOnce(new ReadOnlyModeError("addNote"));

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [{ fields: { Front: "q", Back: "a" } }],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("read-only mode");
    });

    it("should fail all notes when model name is invalid (empty fields)", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]); // modelFieldNames returns empty

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "NonExistentModel",
          notes: [
            { fields: { Front: "q1", Back: "a1" } },
            { fields: { Front: "q2", Back: "a2" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("NonExistentModel");
      expect(result.hint).toContain("modelNames");
      expect(result.totalRequested).toBe(2);
      // Only modelFieldNames was called, no addNote calls
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should return error when modelFieldNames returns null", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce(null); // modelFieldNames returns null

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "GhostModel",
          notes: [{ fields: { Front: "q", Back: "a" } }],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("GhostModel");
      expect(result.error).toContain("not found");
      expect(result.totalRequested).toBe(1);
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should catch missing sort field key in note fields", async () => {
      // Arrange - model has "Front" as sort field, but note only has "Back"
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [{ fields: { Back: "answer only" } }], // missing "Front" entirely
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("empty sort field");
      expect(result.error).toContain("Front");
      expect(result.invalidNotes).toHaveLength(1);
      expect(result.invalidNotes[0].index).toBe(0);
      // Only modelFieldNames was called, no addNote calls
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should merge shared and per-note tags with deduplication", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001); // addNote

      // Act
      await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          tags: ["shared", "vocab"],
          notes: [
            {
              fields: { Front: "q", Back: "a" },
              tags: ["vocab", "extra"], // "vocab" overlaps with shared tags
            },
          ],
        },
        mockContext,
      );

      // Assert - verify the tags passed to addNote are deduplicated
      const addNoteCall = ankiClient.invoke.mock.calls[1];
      expect(addNoteCall[0]).toBe("addNote");
      const noteParams = (addNoteCall[1] as { note: Record<string, unknown> })
        .note;
      const tags = noteParams.tags as string[];
      expect(tags).toEqual(["shared", "vocab", "extra"]);
      // Verify no duplicates
      expect(new Set(tags).size).toBe(tags.length);
    });

    it("should validate empty sort field before making AnkiConnect calls", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce(["Front", "Back"]); // modelFieldNames

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "valid", Back: "ok" } },
            { fields: { Front: "", Back: "missing front" } }, // empty sort field
            { fields: { Front: "   ", Back: "whitespace" } }, // whitespace sort field
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("empty sort field");
      expect(result.invalidNotes).toHaveLength(2);
      expect(result.invalidNotes[0].index).toBe(1);
      expect(result.invalidNotes[1].index).toBe(2);
      // Only modelFieldNames was called, no addNote calls
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should report progress correctly for each note", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001) // addNote #1
        .mockResolvedValueOnce(1002); // addNote #2

      // Act
      await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "q1", Back: "a1" } },
            { fields: { Front: "q2", Back: "a2" } },
          ],
        },
        mockContext,
      );

      // Assert - totalSteps = 2 notes + 2 validation steps = 4
      // Calls: step 0/4, step 1/4, step 2/4, step 3/4, step 4/4
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(5);
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(1, {
        progress: 0,
        total: 4,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(2, {
        progress: 1,
        total: 4,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(3, {
        progress: 2,
        total: 4,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(4, {
        progress: 3,
        total: 4,
      });
      expect(mockContext.reportProgress).toHaveBeenNthCalledWith(5, {
        progress: 4,
        total: 4,
      });
    });

    it("should handle duplicate error messages from AnkiConnect", async () => {
      // Arrange - AnkiConnect throws an error containing "duplicate"
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockRejectedValueOnce(
          new AnkiConnectError(
            "cannot create note because it is a duplicate",
            "addNote",
          ),
        )
        .mockResolvedValueOnce(1002); // addNote #2 succeeds

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [
            { fields: { Front: "dup", Back: "dup" } },
            { fields: { Front: "new", Back: "new" } },
          ],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.created).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.results[0]).toEqual({
        index: 0,
        status: "skipped",
        reason: "duplicate",
      });
    });

    it("should pass allowDuplicate and duplicateScope options to each note", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001);

      // Act
      await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          allowDuplicate: true,
          duplicateScope: "deck",
          notes: [{ fields: { Front: "q", Back: "a" } }],
        },
        mockContext,
      );

      // Assert
      const addNoteCall = ankiClient.invoke.mock.calls[1];
      const noteParams = (addNoteCall[1] as { note: Record<string, unknown> })
        .note;
      expect(noteParams.options).toEqual({
        allowDuplicate: true,
        duplicateScope: "deck",
      });
    });

    it("should handle notes without per-note tags (shared tags only)", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001);

      // Act
      await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          tags: ["shared"],
          notes: [{ fields: { Front: "q", Back: "a" } }], // no per-note tags
        },
        mockContext,
      );

      // Assert
      const addNoteCall = ankiClient.invoke.mock.calls[1];
      const noteParams = (addNoteCall[1] as { note: Record<string, unknown> })
        .note;
      expect(noteParams.tags).toEqual(["shared"]);
    });

    it("should not include tags when neither shared nor per-note tags are provided", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"]) // modelFieldNames
        .mockResolvedValueOnce(1001);

      // Act
      await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "Basic",
          notes: [{ fields: { Front: "q", Back: "a" } }],
        },
        mockContext,
      );

      // Assert
      const addNoteCall = ankiClient.invoke.mock.calls[1];
      const noteParams = (addNoteCall[1] as { note: Record<string, unknown> })
        .note;
      expect(noteParams.tags).toBeUndefined();
    });

    it("should handle modelFieldNames throwing an error", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(
        new AnkiConnectError("model not found", "modelFieldNames"),
      );

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "Spanish",
          modelName: "BadModel",
          notes: [{ fields: { Front: "q", Back: "a" } }],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("model not found");
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
    });

    it("should include deckName and modelName in the response", async () => {
      // Arrange
      ankiClient.invoke
        .mockResolvedValueOnce(["Front", "Back"])
        .mockResolvedValueOnce(1001);

      // Act
      const rawResult = await tool.addNotes(
        {
          deckName: "My Deck",
          modelName: "My Model",
          notes: [{ fields: { Front: "q", Back: "a" } }],
        },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.deckName).toBe("My Deck");
      expect(result.modelName).toBe("My Model");
    });
  });
});
