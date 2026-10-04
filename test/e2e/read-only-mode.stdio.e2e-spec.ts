/**
 * E2E tests for read-only mode - STDIO transport
 *
 * Verifies that --read-only flag blocks content modifications and
 * manual rescheduling while allowing read operations and sync.
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - Built project: npm run build
 */
import { callTool, listTools, setTransport, getTransport } from "./helpers";

describe("E2E: Read-Only Mode (STDIO)", () => {
  beforeAll(() => {
    setTransport("stdio", { readOnly: true });
    expect(getTransport()).toBe("stdio");
  });

  describe("Tool Discovery", () => {
    it("should still list all tools in read-only mode", () => {
      const tools = listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain("listDecks");
      expect(toolNames).toContain("addNote");
      expect(toolNames).toContain("sync");
    });
  });

  describe("Read Operations (should be allowed)", () => {
    it("should allow listing decks", () => {
      const result = callTool("listDecks");
      expect(result).toHaveProperty("decks");
      expect(Array.isArray(result.decks)).toBe(true);
    });

    it("should allow listing models", () => {
      const result = callTool("modelNames");
      expect(result).toHaveProperty("modelNames");
      expect(Array.isArray(result.modelNames)).toBe(true);
    });

    it("should allow finding notes", () => {
      const result = callTool("findNotes", { query: "deck:Default" });
      expect(result).toHaveProperty("noteIds");
      expect(Array.isArray(result.noteIds)).toBe(true);
    });

    it("should allow getting tags", () => {
      const result = callTool("getTags");
      expect(result).toHaveProperty("tags");
      expect(Array.isArray(result.tags)).toBe(true);
    });
  });

  describe("Review Operations (should be allowed)", () => {
    it("should allow sync", () => {
      const result = callTool("sync");
      expect(result).toHaveProperty("success");
      // Sync might fail if not connected to AnkiWeb, but should not be blocked
      // The key is it's not blocked with "read-only mode" error
      expect(result).not.toHaveProperty(
        "error",
        expect.stringContaining("read-only mode"),
      );
    });
  });

  describe("Write Operations (should be blocked)", () => {
    it("should block createDeck", () => {
      const result = callTool("createDeck", {
        deckName: "ReadOnlyTest_ShouldFail",
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block addNote", () => {
      const result = callTool("addNote", {
        deckName: "Default",
        modelName: "Basic",
        fields: { Front: "test", Back: "test" },
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block addTags", () => {
      const result = callTool("addTags", { notes: [1], tags: "test-tag" });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block storeMediaFile", () => {
      const result = callTool("storeMediaFile", {
        filename: "test.txt",
        data: "dGVzdA==", // base64 "test"
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block createModel", () => {
      const result = callTool("createModel", {
        modelName: "ReadOnlyTestModel",
        inOrderFields: ["Front", "Back"],
        cardTemplates: [
          { Name: "Card 1", Front: "{{Front}}", Back: "{{Back}}" },
        ],
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block guiUndo", () => {
      const result = callTool("guiUndo");
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block guiAddCards", () => {
      const result = callTool("guiAddCards", {
        note: {
          deckName: "Default",
          modelName: "Basic",
          fields: { Front: "test", Back: "test" },
        },
      });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });

    it("should block guiEditNote", () => {
      const result = callTool("guiEditNote", { note: 1 });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
    });
  });

  describe("Scheduling Overrides (should be blocked)", () => {
    // Both tools check that the cards exist before the blocked write, so they
    // need a real card, created through a writable server.
    let cardId: number;

    beforeAll(() => {
      setTransport("stdio");
      const uid = String(Date.now()).slice(-8);
      const noteResult = callTool("addNote", {
        deckName: "Default",
        modelName: "Basic",
        fields: {
          Front: `ReadOnly Schedule Front ${uid}`,
          Back: `ReadOnly Schedule Back ${uid}`,
        },
      });
      expect(noteResult).toHaveProperty("noteId");
      const infoResult = callTool("notesInfo", {
        notes: [noteResult.noteId as number],
      });
      const notes = infoResult.notes as Array<{ cards: number[] }>;
      cardId = notes[0].cards[0];

      setTransport("stdio", { readOnly: true });
    });

    it("should block forgetCards", () => {
      const result = callTool("forgetCards", { cards: [cardId] });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
      expect(result.hint).toContain("read-only mode");
    });

    it("should block setDueDate", () => {
      // The Inspector CLI JSON-parses each --tool-arg value, so "1" would
      // arrive as the number 1; a range is not valid JSON and stays a string.
      const result = callTool("setDueDate", { cards: [cardId], days: "1-2" });
      expect(result).toHaveProperty("success", false);
      expect(result).toHaveProperty("error");
      expect(result.error).toContain("read-only mode");
      expect(result.hint).toContain("read-only mode");
    });
  });
});
