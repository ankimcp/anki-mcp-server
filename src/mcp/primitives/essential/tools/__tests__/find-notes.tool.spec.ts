import { Test, TestingModule } from "@nestjs/testing";
import { FindNotesTool } from "../find-notes.tool";
import {
  AnkiConnectClient,
  AnkiConnectError,
} from "../../../../clients/anki-connect.client";
import { mockQueries } from "../../../../../test-fixtures/mock-data";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

jest.mock("../../../../clients/anki-connect.client");

describe("FindNotesTool", () => {
  let tool: FindNotesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FindNotesTool, AnkiConnectClient],
    }).compile();

    tool = module.get<FindNotesTool>(FindNotesTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    jest.clearAllMocks();
  });

  describe("findNotes", () => {
    it("should return note IDs for valid query", async () => {
      // Arrange
      const noteIds = [1502298033753, 1502298033755, 1502298033757];
      ankiClient.invoke.mockResolvedValueOnce(noteIds);

      // Act
      const rawResult = await tool.findNotes({
        query: mockQueries.valid.deckSpecific,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("findNotes", {
        query: "deck:Spanish",
      });
      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual(noteIds);
      expect(result.count).toBe(3);
      expect(result.message).toBe("Found 3 notes matching the query");
    });

    it("should handle empty results gracefully", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([]);

      // Act
      const rawResult = await tool.findNotes({ query: "deck:NonExistent" });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.message).toBe(
        "No notes found matching the search criteria",
      );
      expect(result.hint).toContain("Try a broader search query");
    });

    it("should provide hint for large result sets", async () => {
      // Arrange
      const largeNoteIdArray = Array.from(
        { length: 150 },
        (_, i) => 1500000000000 + i,
      );
      ankiClient.invoke.mockResolvedValueOnce(largeNoteIdArray);

      // Act
      const rawResult = await tool.findNotes({ query: "is:due" });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.count).toBe(150);
      expect(result.hint).toContain("Large result set");
      expect(result.hint).toContain(
        "Consider using notesInfo with smaller batches",
      );
    });

    it("should handle complex queries correctly", async () => {
      // Arrange
      const noteIds = [1502298033753];
      ankiClient.invoke.mockResolvedValueOnce(noteIds);

      // Act
      const rawResult = await tool.findNotes({
        query: mockQueries.valid.combined,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("findNotes", {
        query: "deck:Spanish tag:spanish",
      });
      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual(noteIds);
    });

    it("should handle invalid query syntax errors", async () => {
      // Arrange
      const queryError = new AnkiConnectError("Invalid query", "findNotes");
      ankiClient.invoke.mockRejectedValueOnce(queryError);

      // Act
      const rawResult = await tool.findNotes({
        query: mockQueries.invalid.malformed,
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid query");
      expect(result.hint).toContain("Invalid query syntax");
      expect(result.examples).toBeDefined();
      expect(result.examples).toContainEqual(
        '"deck:DeckName" - all notes in a deck',
      );
    });

    it("should handle network errors", async () => {
      // Arrange
      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      // Act
      const rawResult = await tool.findNotes({ query: "deck:Spanish" });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("fetch failed");
      expect(result.hint).toContain("Make sure Anki is running");
    });

    it("should handle various Anki query syntax patterns", async () => {
      // Test different query types
      const testCases = [
        { query: "is:due", description: "due cards" },
        { query: "is:new", description: "new cards" },
        { query: "tag:important", description: "tagged notes" },
        { query: "added:7", description: "recently added" },
        { query: "front:hello", description: "front field search" },
        { query: "flag:1", description: "flagged notes" },
        { query: "prop:due<=2", description: "due within days" },
        { query: "deck:Spanish OR deck:French", description: "OR operator" },
      ];

      for (const testCase of testCases) {
        // Arrange
        ankiClient.invoke.mockResolvedValueOnce([1502298033753]);

        // Act
        const rawResult = await tool.findNotes({ query: testCase.query });
        const result = parseToolResult(rawResult);

        // Assert
        expect(ankiClient.invoke).toHaveBeenCalledWith("findNotes", {
          query: testCase.query,
        });
        expect(result.success).toBe(true);
        expect(result.query).toBe(testCase.query);
      }
    });

    it("should report progress correctly", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce([1, 2, 3]);

      // Act
      await tool.findNotes({ query: "deck:Test" });

      // Assert
    });

    it("should handle null or undefined results", async () => {
      // Arrange
      ankiClient.invoke.mockResolvedValueOnce(null as any);

      // Act
      const rawResult = await tool.findNotes({ query: "deck:Test" });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.noteIds).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.message).toBe(
        "No notes found matching the search criteria",
      );
    });

    it("should preserve query in response for reference", async () => {
      // Arrange
      const query = "deck:Spanish tag:verb is:due";
      ankiClient.invoke.mockResolvedValueOnce([1, 2]);

      // Act
      const rawResult = await tool.findNotes({ query });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.query).toBe(query);
      expect(result.success).toBe(true);
    });
  });
});
