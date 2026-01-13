/**
 * E2E tests for MCP tools - HTTP Streamable transport
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - HTTP server running: npm run start:prod:http
 */
import {
  callTool,
  listTools,
  setTransport,
  getTransport,
  waitForServer,
} from "./helpers";

/** Generate unique suffix to avoid duplicate conflicts */
function uniqueId(): string {
  return String(Date.now()).slice(-8);
}

describe("E2E: MCP Tools (HTTP Streamable)", () => {
  beforeAll(async () => {
    setTransport("http");
    expect(getTransport()).toBe("http");

    const ready = await waitForServer(60);
    if (!ready) {
      throw new Error("MCP server not ready after 60 seconds");
    }
  }, 70000);

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
      const deckName = `HTTP_E2E_${uniqueId()}`;
      const result = callTool("create_deck", { deck_name: deckName });
      expect(result).toHaveProperty("deckId");
      expect(typeof result.deckId).toBe("number");
      expect((result.deckId as number) > 0).toBe(true);
    });

    it("should create a nested deck (2 levels)", () => {
      const deckName = `HTTP::Nested${uniqueId()}`;
      const result = callTool("create_deck", { deck_name: deckName });
      expect(result).toHaveProperty("deckId");
      expect((result.deckId as number) > 0).toBe(true);
    });

    it("should return existing deck ID when creating duplicate", () => {
      const deckName = `HTTP::Exist${uniqueId()}`;
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
      const deckName = `HTTP::TagTest${uid}`;
      const uniqueTag = `http-e2e-tag-${uid}`;

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
      const deckName = `HTTP::FilterTag${uid}`;
      const filterableTag = `http-filter-${uid}`;

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
      const result = callTool("getTags", { pattern: `http-filter-${uid}` });
      expect(result.success).toBe(true);
      expect(result.filtered).toBe(true);
      expect(result.tags as string[]).toContain(filterableTag);
      expect((result.tags as string[]).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Add Note", () => {
    it("should create a basic note", () => {
      const uid = uniqueId();
      const deckName = `HTTP::Notes${uid}`;
      callTool("create_deck", { deck_name: deckName });

      const result = callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `HTTP Test Question ${uid}`,
          Back: `HTTP Test Answer ${uid}`,
        },
      });

      expect(result).toHaveProperty("noteId");
      expect((result.noteId as number) > 0).toBe(true);
    });

    it("should create a note with tags", () => {
      const uid = uniqueId();
      const deckName = `HTTP::Tags${uid}`;
      callTool("create_deck", { deck_name: deckName });

      const result = callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Tagged Question ${uid}`,
          Back: `Tagged Answer ${uid}`,
        },
        tags: ["e2e", "http-test"],
      });

      expect(result).toHaveProperty("noteId");
      expect((result.noteId as number) > 0).toBe(true);
    });
  });

  describe("Notes Info", () => {
    it("should get note information", () => {
      const uid = uniqueId();
      const deckName = `HTTP::Info${uid}`;
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
