import { Test, TestingModule } from "@nestjs/testing";
import { TagActionsTool } from "../tagActions.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

describe("TagActionsTool", () => {
  let tool: TagActionsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TagActionsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<TagActionsTool>(TagActionsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("addTags action", () => {
    it("should add single tag to notes", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [1234567890, 1234567891],
        tags: "vocabulary",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("addTags", {
        notes: [1234567890, 1234567891],
        tags: "vocabulary",
      });
      expect(result.success).toBe(true);
      expect(result.notesAffected).toBe(2);
      expect(result.tagsAdded).toEqual(["vocabulary"]);
    });

    it("should add multiple space-separated tags", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [1234567890],
        tags: "verb tense irregular",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("addTags", {
        notes: [1234567890],
        tags: "verb tense irregular",
      });
      expect(result.success).toBe(true);
      expect(result.tagsAdded).toEqual(["verb", "tense", "irregular"]);
    });

    it("should fail when notes array is empty", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [],
        tags: "test",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("notes array is required");
    });

    it("should fail when tags string is empty", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [1234567890],
        tags: "",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("tags string is required");
    });
  });

  describe("removeTags action", () => {
    it("should remove single tag from notes", async () => {
      // Arrange
      const params = {
        action: "removeTags" as const,
        notes: [1234567890, 1234567891],
        tags: "old-tag",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("removeTags", {
        notes: [1234567890, 1234567891],
        tags: "old-tag",
      });
      expect(result.success).toBe(true);
      expect(result.notesAffected).toBe(2);
      expect(result.tagsRemoved).toEqual(["old-tag"]);
    });

    it("should remove multiple space-separated tags", async () => {
      // Arrange
      const params = {
        action: "removeTags" as const,
        notes: [1234567890],
        tags: "deprecated obsolete",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tagsRemoved).toEqual(["deprecated", "obsolete"]);
    });

    it("should fail when notes array is missing", async () => {
      // Arrange
      const params = {
        action: "removeTags" as const,
        tags: "test",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("notes array is required");
    });
  });

  describe("replaceTags action", () => {
    it("should replace tag in notes", async () => {
      // Arrange
      const params = {
        action: "replaceTags" as const,
        notes: [1234567890, 1234567891, 1234567892],
        tagToReplace: "RomanEmpire",
        replaceWithTag: "roman-empire",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("replaceTags", {
        notes: [1234567890, 1234567891, 1234567892],
        tag_to_replace: "RomanEmpire",
        replace_with_tag: "roman-empire",
      });
      expect(result.success).toBe(true);
      expect(result.notesAffected).toBe(3);
      expect(result.tagToReplace).toBe("RomanEmpire");
      expect(result.replaceWithTag).toBe("roman-empire");
    });

    it("should fail when tagToReplace is missing", async () => {
      // Arrange
      const params = {
        action: "replaceTags" as const,
        notes: [1234567890],
        replaceWithTag: "new-tag",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("tagToReplace is required");
    });

    it("should fail when replaceWithTag is missing", async () => {
      // Arrange
      const params = {
        action: "replaceTags" as const,
        notes: [1234567890],
        tagToReplace: "old-tag",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("replaceWithTag is required");
    });

    it("should fail when tag contains spaces", async () => {
      // Arrange
      const params = {
        action: "replaceTags" as const,
        notes: [1234567890],
        tagToReplace: "old tag",
        replaceWithTag: "new-tag",
      };

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("cannot contain spaces");
    });
  });

  describe("clearUnusedTags action", () => {
    it("should clear unused tags", async () => {
      // Arrange
      const params = {
        action: "clearUnusedTags" as const,
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledWith("clearUnusedTags");
      expect(result.success).toBe(true);
      expect(result.message).toContain("Successfully cleared unused tags");
    });
  });

  describe("error handling", () => {
    it("should handle network errors", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [1234567890],
        tags: "test",
      };
      ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should handle AnkiConnect errors", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [9999999999],
        tags: "test",
      };
      ankiClient.invoke.mockRejectedValueOnce(new Error("Note not found"));

      // Act
      const rawResult = await tool.execute(params, mockContext);
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Note not found");
    });
  });

  describe("progress reporting", () => {
    it("should report progress for addTags", async () => {
      // Arrange
      const params = {
        action: "addTags" as const,
        notes: [1234567890],
        tags: "test",
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      await tool.execute(params, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });

    it("should report progress for clearUnusedTags", async () => {
      // Arrange
      const params = {
        action: "clearUnusedTags" as const,
      };
      ankiClient.invoke.mockResolvedValueOnce(null);

      // Act
      await tool.execute(params, mockContext);

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 50,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
    });
  });
});
