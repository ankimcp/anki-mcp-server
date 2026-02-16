/**
 * E2E tests for addNotes (bulk) tool - STDIO transport
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - Built project: npm run build
 */
import { callTool, setTransport, getTransport } from "./helpers";

/** Generate unique suffix to avoid duplicate conflicts */
function uniqueId(): string {
  return String(Date.now()).slice(-8);
}

describe("E2E: addNotes (STDIO)", () => {
  beforeAll(() => {
    setTransport("stdio");
    expect(getTransport()).toBe("stdio");
  });

  it("should create a batch of notes and verify they exist", () => {
    const uid = uniqueId();
    const deckName = `STDIO::BulkAdd${uid}`;
    callTool("deckActions", { action: "createDeck", deckName });

    const result = callTool("addNotes", {
      deckName,
      modelName: "Basic",
      tags: ["e2e-bulk", `batch-${uid}`],
      notes: [
        {
          fields: {
            Front: `Bulk Q1 ${uid}`,
            Back: `Bulk A1 ${uid}`,
          },
        },
        {
          fields: {
            Front: `Bulk Q2 ${uid}`,
            Back: `Bulk A2 ${uid}`,
          },
        },
        {
          fields: {
            Front: `Bulk Q3 ${uid}`,
            Back: `Bulk A3 ${uid}`,
          },
          tags: ["extra-tag"],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.totalRequested).toBe(3);
    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.deckName).toBe(deckName);
    expect(result.modelName).toBe("Basic");

    const results = result.results as Array<{
      index: number;
      status: string;
      noteId: number;
    }>;
    expect(results).toHaveLength(3);

    // Verify each result has a noteId
    for (const r of results) {
      expect(r.status).toBe("created");
      expect(r.noteId).toBeGreaterThan(0);
    }

    // Verify notes exist in Anki via notesInfo
    const noteIds = results.map((r) => r.noteId);
    const infoResult = callTool("notesInfo", { notes: noteIds });
    const notes = infoResult.notes as Array<{
      noteId: number;
      tags: string[];
      modelName: string;
    }>;
    expect(notes).toHaveLength(3);

    // Verify shared tags are present on all notes
    for (const note of notes) {
      expect(note.tags).toContain("e2e-bulk");
      expect(note.tags).toContain(`batch-${uid}`);
    }

    // Verify per-note extra tag on the third note
    expect(notes[2].tags).toContain("extra-tag");
  });

  it("should handle batch with duplicates (partial success)", () => {
    const uid = uniqueId();
    const deckName = `STDIO::BulkDup${uid}`;
    callTool("deckActions", { action: "createDeck", deckName });

    // First, create a note that will be a duplicate
    callTool("addNote", {
      deckName,
      modelName: "Basic",
      fields: {
        Front: `Dup Front ${uid}`,
        Back: `Dup Back ${uid}`,
      },
    });

    // Now try a batch where one note is a duplicate
    const result = callTool("addNotes", {
      deckName,
      modelName: "Basic",
      notes: [
        {
          fields: {
            Front: `Dup Front ${uid}`,
            Back: `Dup Back ${uid}`,
          },
        },
        {
          fields: {
            Front: `New Front ${uid}`,
            Back: `New Back ${uid}`,
          },
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.totalRequested).toBe(2);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);

    const results = result.results as Array<{
      index: number;
      status: string;
      noteId?: number;
      reason?: string;
    }>;
    expect(results).toHaveLength(2);

    // First note (duplicate) should be skipped
    expect(results[0].status).toBe("skipped");
    // Second note (new) should be created
    expect(results[1].status).toBe("created");
    expect(results[1].noteId).toBeGreaterThan(0);
  });
});

describe("E2E: addNotes read-only mode (STDIO)", () => {
  beforeAll(() => {
    setTransport("stdio", { readOnly: true });
    expect(getTransport()).toBe("stdio");
  });

  it("should block addNotes in read-only mode", () => {
    const result = callTool("addNotes", {
      deckName: "Default",
      modelName: "Basic",
      notes: [{ fields: { Front: "blocked", Back: "blocked" } }],
    });

    expect(result).toHaveProperty("success", false);
    expect(result).toHaveProperty("error");
    expect(result.error).toContain("read-only mode");
  });
});
