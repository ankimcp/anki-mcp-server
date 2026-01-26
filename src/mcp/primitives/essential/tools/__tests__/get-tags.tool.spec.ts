import { Test, TestingModule } from "@nestjs/testing";
import { GetTagsTool } from "../get-tags.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createMockContext,
  parseToolResult,
} from "@/test-fixtures/test-helpers";

describe("GetTagsTool", () => {
  let tool: GetTagsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetTagsTool,
        {
          provide: AnkiConnectClient,
          useValue: {
            invoke: jest.fn(),
          },
        },
      ],
    }).compile();

    tool = module.get<GetTagsTool>(GetTagsTool);
    ankiClient = module.get(AnkiConnectClient);
    mockContext = createMockContext();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Basic Tag Retrieval", () => {
    it("should return list of all tags", async () => {
      const tags = ["vocabulary", "grammar", "verb", "noun"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(tags);
      expect(result.total).toBe(4);
      expect(result.message).toBe("Found 4 tags");
      expect(ankiClient.invoke).toHaveBeenCalledWith("getTags");
    });

    it("should return single tag", async () => {
      const tags = ["vocabulary"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(tags);
      expect(result.total).toBe(1);
      expect(result.message).toBe("Found 1 tags");
    });

    it("should handle many tags (100+)", async () => {
      const tags = Array.from({ length: 150 }, (_, i) => `tag-${i + 1}`);

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(tags);
      expect(result.total).toBe(150);
      expect(result.message).toBe("Found 150 tags");
    });
  });

  describe("Pattern Filtering", () => {
    it("should filter tags by pattern (case-insensitive)", async () => {
      const allTags = [
        "roman-empire",
        "roman_republic",
        "greek-history",
        "medieval",
        "RomanArt",
      ];

      ankiClient.invoke.mockResolvedValueOnce(allTags);

      const rawResult = await tool.getTags({ pattern: "roman" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual([
        "roman-empire",
        "roman_republic",
        "RomanArt",
      ]);
      expect(result.total).toBe(3);
      expect(result.filtered).toBe(true);
      expect(result.totalUnfiltered).toBe(5);
      expect(result.message).toBe('Found 3 tags matching "roman" (5 total)');
    });

    it("should handle uppercase pattern", async () => {
      const allTags = ["vocabulary", "VOCABULARY", "Vocab"];

      ankiClient.invoke.mockResolvedValueOnce(allTags);

      const rawResult = await tool.getTags({ pattern: "VOCAB" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(["vocabulary", "VOCABULARY", "Vocab"]);
      expect(result.total).toBe(3);
    });

    it("should return empty array when no tags match pattern", async () => {
      const allTags = ["vocabulary", "grammar", "verb"];

      ankiClient.invoke.mockResolvedValueOnce(allTags);

      const rawResult = await tool.getTags(
        { pattern: "nonexistent" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.filtered).toBe(true);
      expect(result.totalUnfiltered).toBe(3);
      expect(result.message).toBe(
        'Found 0 tags matching "nonexistent" (3 total)',
      );
    });

    it("should handle partial match in middle of tag", async () => {
      const allTags = ["pre-verb-suffix", "verb", "verb-ending"];

      ankiClient.invoke.mockResolvedValueOnce(allTags);

      const rawResult = await tool.getTags({ pattern: "verb" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(["pre-verb-suffix", "verb", "verb-ending"]);
      expect(result.total).toBe(3);
    });

    it("should not include filtered/totalUnfiltered when no pattern provided", async () => {
      const tags = ["vocab", "grammar"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.filtered).toBeUndefined();
      expect(result.totalUnfiltered).toBeUndefined();
    });
  });

  describe("Error Handling", () => {
    it("should handle AnkiConnect connection error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("ECONNREFUSED");
      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });

    it("should handle generic AnkiConnect error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Unknown error"));

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unknown error");
      expect(result.hint).toBe(
        "Make sure Anki is running and AnkiConnect is installed",
      );
    });

    it("should handle timeout errors", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Request timeout"));

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Request timeout");
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty tag list", async () => {
      const tags: string[] = [];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe("No tags found in Anki collection");
    });

    it("should handle null response from AnkiConnect", async () => {
      ankiClient.invoke.mockResolvedValueOnce(null);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe("No tags found in Anki collection");
    });

    it("should handle undefined response from AnkiConnect", async () => {
      ankiClient.invoke.mockResolvedValueOnce(undefined);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.message).toBe("No tags found in Anki collection");
    });

    it("should handle tags with special characters", async () => {
      const tags = ["tag::nested", "tag (v2)", "tag & more", "tag-with-dashes"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(tags);
      expect(result.total).toBe(4);
    });

    it("should handle tags with unicode characters", async () => {
      const tags = ["日本語", "español", "русский", "العربية"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(tags);
      expect(result.total).toBe(4);
    });

    it("should filter unicode tags correctly", async () => {
      const tags = ["日本語-vocab", "español-grammar", "日本語-grammar"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({ pattern: "日本語" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(["日本語-vocab", "日本語-grammar"]);
      expect(result.total).toBe(2);
    });

    it("should handle very long tag names", async () => {
      const longTag = "a".repeat(500);
      const tags = [longTag, "short"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toContain(longTag);
      expect(result.total).toBe(2);
    });

    it("should handle duplicate tags (if AnkiConnect returns them)", async () => {
      const tags = ["vocab", "vocab", "grammar"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.total).toBe(3);
      expect(result.tags).toEqual(["vocab", "vocab", "grammar"]);
    });

    it("should handle empty pattern string", async () => {
      const tags = ["vocab", "grammar"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      // Empty string pattern should match all tags
      const rawResult = await tool.getTags({ pattern: "" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(tags);
      expect(result.total).toBe(2);
    });
  });

  describe("Progress Reporting", () => {
    it("should report progress during retrieval", async () => {
      const tags = ["vocab", "grammar"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      await tool.getTags({}, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 75,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 100,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(3);
    });

    it("should report progress even when retrieval fails", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Failed"));

      await tool.getTags({}, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalledWith({
        progress: 25,
        total: 100,
      });
      expect(mockContext.reportProgress).toHaveBeenCalledTimes(1);
    });

    it("should report progress with pattern filtering", async () => {
      const tags = ["roman-empire", "greek"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      await tool.getTags({ pattern: "roman" }, mockContext);

      expect(mockContext.reportProgress).toHaveBeenCalledTimes(3);
    });
  });

  describe("Response Structure", () => {
    it("should return correct structure on success", async () => {
      const tags = ["vocab", "grammar"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("tags");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("message");
      expect(result.success).toBe(true);
    });

    it("should return correct structure on error", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("Connection error"));

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("error");
      expect(result).toHaveProperty("hint");
      expect(result.success).toBe(false);
    });

    it("should return filtered structure when pattern provided", async () => {
      const tags = ["roman-empire", "greek"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({ pattern: "roman" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).toHaveProperty("filtered");
      expect(result).toHaveProperty("totalUnfiltered");
      expect(result.filtered).toBe(true);
      expect(result.totalUnfiltered).toBe(2);
    });

    it("should not include hint on success", async () => {
      const tags = ["vocab"];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({}, mockContext);
      const result = parseToolResult(rawResult);

      expect(result).not.toHaveProperty("hint");
    });
  });

  describe("Real-world Tag Scenarios", () => {
    it("should help discover tag variations to prevent duplication", async () => {
      // Simulating the exact issue from GitHub #13
      const existingTags = [
        "roman-empire",
        "roman_empire",
        "RomanEmpire",
        "history",
        "ancient",
      ];

      ankiClient.invoke.mockResolvedValueOnce(existingTags);

      const rawResult = await tool.getTags({ pattern: "roman" }, mockContext);
      const result = parseToolResult(rawResult);

      // User can now see all Roman-related tag variations
      expect(result.success).toBe(true);
      expect(result.tags).toHaveLength(3);
      expect(result.tags).toContain("roman-empire");
      expect(result.tags).toContain("roman_empire");
      expect(result.tags).toContain("RomanEmpire");
    });

    it("should help with hierarchical tag discovery", async () => {
      const tags = [
        "language::spanish::vocab",
        "language::spanish::grammar",
        "language::french::vocab",
        "history::ancient",
        "history::modern",
      ];

      ankiClient.invoke.mockResolvedValueOnce(tags);

      const rawResult = await tool.getTags({ pattern: "spanish" }, mockContext);
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.tags).toEqual([
        "language::spanish::vocab",
        "language::spanish::grammar",
      ]);
    });
  });
});
