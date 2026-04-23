import { Test, TestingModule } from "@nestjs/testing";
import { AddTagsTool } from "../add-tags.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("AddTagsTool", () => {
  let tool: AddTagsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AddTagsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<AddTagsTool>(AddTagsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should add single tag to notes", async () => {
    const params = {
      notes: [1234567890, 1234567891],
      tags: "vocabulary",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("addTags", {
      notes: [1234567890, 1234567891],
      tags: "vocabulary",
    });
    expect(result.success).toBe(true);
    expect(result.notesAffected).toBe(2);
    expect(result.tagsAdded).toEqual(["vocabulary"]);
  });

  it("should add multiple space-separated tags", async () => {
    const params = {
      notes: [1234567890],
      tags: "verb tense irregular",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("addTags", {
      notes: [1234567890],
      tags: "verb tense irregular",
    });
    expect(result.success).toBe(true);
    expect(result.tagsAdded).toEqual(["verb", "tense", "irregular"]);
  });

  it("should fail when notes array is empty", async () => {
    const params = {
      notes: [],
      tags: "test",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("notes array is required");
  });

  it("should fail when tags string is empty", async () => {
    const params = {
      notes: [1234567890],
      tags: "",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("tags string is required");
  });

  it("should handle network errors", async () => {
    const params = {
      notes: [1234567890],
      tags: "test",
    };
    ankiClient.invoke.mockRejectedValueOnce(new Error("Network error"));

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("should handle AnkiConnect errors", async () => {
    const params = {
      notes: [9999999999],
      tags: "test",
    };
    ankiClient.invoke.mockRejectedValueOnce(new Error("Note not found"));

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Note not found");
  });

  it("should report progress", async () => {
    const params = {
      notes: [1234567890],
      tags: "test",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    await tool.execute(params, mockContext);

    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 25,
      total: 100,
    });
    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 100,
      total: 100,
    });
  });
});
