/**
 * E2E tests for MCP tools - STDIO transport
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - Built project: npm run build
 */
import { callTool, listTools, setTransport, getTransport } from "./helpers";

/** Generate unique suffix to avoid duplicate conflicts */
function uniqueId(): string {
  return String(Date.now()).slice(-8);
}

describe("E2E: MCP Tools (STDIO)", () => {
  beforeAll(() => {
    setTransport("stdio");
    expect(getTransport()).toBe("stdio");
  });

  describe("Tool Discovery", () => {
    it("should return a list of tools", () => {
      const tools = listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });

    it("should have list_decks tool", () => {
      const tools = listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("list_decks");
    });

    it("should have sync tool", () => {
      const tools = listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("sync");
    });

    it("should have findNotes tool", () => {
      const tools = listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("findNotes");
    });

    it("should have addNote tool", () => {
      const tools = listTools();
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("addNote");
    });
  });

  describe("Deck Tools", () => {
    it("should list decks", () => {
      const result = callTool("list_decks");
      expect(result).toHaveProperty("decks");
      expect(Array.isArray(result.decks)).toBe(true);
      // Default deck should always exist
      expect((result.decks as unknown[]).length).toBeGreaterThanOrEqual(1);
    });

    it("should create a simple deck", () => {
      const deckName = `STDIO_E2E_${uniqueId()}`;
      const result = callTool("create_deck", { deck_name: deckName });
      expect(result).toHaveProperty("deckId");
      expect(typeof result.deckId).toBe("number");
      expect((result.deckId as number) > 0).toBe(true);
    });

    it("should create a nested deck (2 levels)", () => {
      const deckName = `STDIO::Nested${uniqueId()}`;
      const result = callTool("create_deck", { deck_name: deckName });
      expect(result).toHaveProperty("deckId");
      expect((result.deckId as number) > 0).toBe(true);
    });

    it("should return existing deck ID when creating duplicate", () => {
      const deckName = `STDIO::Exist${uniqueId()}`;
      const result1 = callTool("create_deck", { deck_name: deckName });
      const deckId = result1.deckId;

      const result2 = callTool("create_deck", { deck_name: deckName });
      expect(result2.deckId).toBe(deckId);
    });
  });

  describe("Note Tools", () => {
    it("should find notes with query", () => {
      const result = callTool("findNotes", { query: "deck:*" });
      expect(result).toHaveProperty("noteIds");
      expect(Array.isArray(result.noteIds)).toBe(true);
    });

    it("should accept limit parameter", () => {
      const result = callTool("findNotes", { query: "deck:*", limit: 5 });
      expect(result).toHaveProperty("noteIds");
      expect(Array.isArray(result.noteIds)).toBe(true);
    });
  });

  describe("Model Tools", () => {
    it("should list model names", () => {
      const result = callTool("modelNames");
      expect(result).toHaveProperty("modelNames");
      expect(Array.isArray(result.modelNames)).toBe(true);
      expect((result.modelNames as string[]).length).toBeGreaterThan(0);
    });

    it("should have Basic model", () => {
      const result = callTool("modelNames");
      expect(result.modelNames as string[]).toContain("Basic");
    });
  });

  describe("Tag Tools", () => {
    it("should list all tags", () => {
      const result = callTool("getTags");
      expect(result).toHaveProperty("tags");
      expect(Array.isArray(result.tags)).toBe(true);
      expect(result).toHaveProperty("total");
    });

    it("should return tags from notes with tags", () => {
      const uid = uniqueId();
      const deckName = `STDIO::TagTest${uid}`;
      const uniqueTag = `stdio-e2e-tag-${uid}`;

      // Create deck and note with unique tag
      callTool("create_deck", { deck_name: deckName });
      callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Tag Test Question ${uid}`,
          Back: `Tag Test Answer ${uid}`,
        },
        tags: [uniqueTag, "e2e-common"],
      });

      // Retrieve tags and verify our unique tag exists
      const result = callTool("getTags");
      expect(result.success).toBe(true);
      expect(result.tags as string[]).toContain(uniqueTag);
      expect(result.tags as string[]).toContain("e2e-common");
    });

    it("should filter tags by pattern", () => {
      const uid = uniqueId();
      const deckName = `STDIO::FilterTag${uid}`;
      const filterableTag = `stdio-filter-${uid}`;

      // Create note with filterable tag
      callTool("create_deck", { deck_name: deckName });
      callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Filter Test ${uid}`,
          Back: `Filter Answer ${uid}`,
        },
        tags: [filterableTag],
      });

      // Filter by pattern
      const result = callTool("getTags", { pattern: `stdio-filter-${uid}` });
      expect(result.success).toBe(true);
      expect(result.filtered).toBe(true);
      expect(result.tags as string[]).toContain(filterableTag);
      expect((result.tags as string[]).length).toBeGreaterThanOrEqual(1);
    });

    describe("tagActions", () => {
      it("should add tags to notes", () => {
        const uid = uniqueId();
        const deckName = `STDIO::AddTags${uid}`;
        const newTag = `stdio-added-${uid}`;

        // Create deck and note without tags
        callTool("create_deck", { deck_name: deckName });
        const addResult = callTool("addNote", {
          deckName: deckName,
          modelName: "Basic",
          fields: {
            Front: `AddTags Test ${uid}`,
            Back: `AddTags Answer ${uid}`,
          },
        });
        const noteId = addResult.noteId as number;

        // Add tags using tagActions
        const result = callTool("tagActions", {
          action: "addTags",
          notes: [noteId],
          tags: newTag,
        });

        expect(result.success).toBe(true);
        expect(result.notesAffected).toBe(1);
        expect(result.tagsAdded).toContain(newTag);

        // Verify tag was added via notesInfo
        const infoResult = callTool("notesInfo", { notes: [noteId] });
        const notes = infoResult.notes as Array<{ tags: string[] }>;
        expect(notes[0].tags).toContain(newTag);
      });

      it("should add multiple space-separated tags", () => {
        const uid = uniqueId();
        const deckName = `STDIO::MultiTags${uid}`;
        const tag1 = `stdio-multi1-${uid}`;
        const tag2 = `stdio-multi2-${uid}`;

        // Create deck and note
        callTool("create_deck", { deck_name: deckName });
        const addResult = callTool("addNote", {
          deckName: deckName,
          modelName: "Basic",
          fields: {
            Front: `MultiTag Test ${uid}`,
            Back: `MultiTag Answer ${uid}`,
          },
        });
        const noteId = addResult.noteId as number;

        // Add multiple tags (space-separated)
        const result = callTool("tagActions", {
          action: "addTags",
          notes: [noteId],
          tags: `${tag1} ${tag2}`,
        });

        expect(result.success).toBe(true);
        expect(result.tagsAdded).toContain(tag1);
        expect(result.tagsAdded).toContain(tag2);

        // Verify both tags exist
        const infoResult = callTool("notesInfo", { notes: [noteId] });
        const notes = infoResult.notes as Array<{ tags: string[] }>;
        expect(notes[0].tags).toContain(tag1);
        expect(notes[0].tags).toContain(tag2);
      });

      it("should remove tags from notes", () => {
        const uid = uniqueId();
        const deckName = `STDIO::RemoveTags${uid}`;
        const tagToRemove = `stdio-remove-${uid}`;

        // Create deck and note with tag
        callTool("create_deck", { deck_name: deckName });
        const addResult = callTool("addNote", {
          deckName: deckName,
          modelName: "Basic",
          fields: {
            Front: `RemoveTags Test ${uid}`,
            Back: `RemoveTags Answer ${uid}`,
          },
          tags: [tagToRemove],
        });
        const noteId = addResult.noteId as number;

        // Verify tag exists
        let infoResult = callTool("notesInfo", { notes: [noteId] });
        let notes = infoResult.notes as Array<{ tags: string[] }>;
        expect(notes[0].tags).toContain(tagToRemove);

        // Remove tag using tagActions
        const result = callTool("tagActions", {
          action: "removeTags",
          notes: [noteId],
          tags: tagToRemove,
        });

        expect(result.success).toBe(true);
        expect(result.notesAffected).toBe(1);
        expect(result.tagsRemoved).toContain(tagToRemove);

        // Verify tag was removed
        infoResult = callTool("notesInfo", { notes: [noteId] });
        notes = infoResult.notes as Array<{ tags: string[] }>;
        expect(notes[0].tags).not.toContain(tagToRemove);
      });

      it("should replace tag on notes", () => {
        const uid = uniqueId();
        const deckName = `STDIO::ReplaceTags${uid}`;
        const oldTag = `stdio-old-${uid}`;
        const newTag = `stdio-new-${uid}`;

        // Create deck and note with old tag
        callTool("create_deck", { deck_name: deckName });
        const addResult = callTool("addNote", {
          deckName: deckName,
          modelName: "Basic",
          fields: {
            Front: `ReplaceTags Test ${uid}`,
            Back: `ReplaceTags Answer ${uid}`,
          },
          tags: [oldTag],
        });
        const noteId = addResult.noteId as number;

        // Replace tag using tagActions
        const result = callTool("tagActions", {
          action: "replaceTags",
          notes: [noteId],
          tagToReplace: oldTag,
          replaceWithTag: newTag,
        });

        expect(result.success).toBe(true);
        expect(result.notesAffected).toBe(1);
        expect(result.tagToReplace).toBe(oldTag);
        expect(result.replaceWithTag).toBe(newTag);

        // Verify tag was replaced
        const infoResult = callTool("notesInfo", { notes: [noteId] });
        const notes = infoResult.notes as Array<{ tags: string[] }>;
        expect(notes[0].tags).not.toContain(oldTag);
        expect(notes[0].tags).toContain(newTag);
      });

      it("should clear unused tags", () => {
        // clearUnusedTags removes orphaned tags from the collection
        // We can't easily verify this in E2E, but we can ensure it executes
        const result = callTool("tagActions", {
          action: "clearUnusedTags",
        });

        expect(result.success).toBe(true);
        expect(result.message).toContain("Successfully cleared unused tags");
      });

      it("should fail when notes array is missing for addTags", () => {
        const result = callTool("tagActions", {
          action: "addTags",
          tags: "test-tag",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("notes array is required");
      });

      it("should fail when tags string is missing for removeTags", () => {
        const result = callTool("tagActions", {
          action: "removeTags",
          notes: [12345],
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("tags string is required");
      });
    });
  });

  describe("Add Note", () => {
    it("should create a basic note", () => {
      const uid = uniqueId();
      const deckName = `STDIO::Notes${uid}`;
      callTool("create_deck", { deck_name: deckName });

      const result = callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `STDIO Test Question ${uid}`,
          Back: `STDIO Test Answer ${uid}`,
        },
      });

      expect(result).toHaveProperty("noteId");
      expect((result.noteId as number) > 0).toBe(true);
    });

    it("should create a note with tags", () => {
      const uid = uniqueId();
      const deckName = `STDIO::Tags${uid}`;
      callTool("create_deck", { deck_name: deckName });

      const result = callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Tagged Question ${uid}`,
          Back: `Tagged Answer ${uid}`,
        },
        tags: ["e2e", "stdio-test"],
      });

      expect(result).toHaveProperty("noteId");
      expect((result.noteId as number) > 0).toBe(true);
    });
  });

  describe("Notes Info", () => {
    it("should get note information", () => {
      const uid = uniqueId();
      const deckName = `STDIO::Info${uid}`;
      callTool("create_deck", { deck_name: deckName });

      const addResult = callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Info Front ${uid}`,
          Back: `Info Back ${uid}`,
        },
      });
      const noteId = addResult.noteId as number;

      const result = callTool("notesInfo", { notes: [noteId] });
      expect(result).toHaveProperty("notes");
      expect(Array.isArray(result.notes)).toBe(true);
      expect((result.notes as unknown[]).length).toBe(1);
    });
  });
});
