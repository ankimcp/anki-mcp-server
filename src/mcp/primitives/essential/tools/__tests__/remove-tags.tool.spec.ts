import { Test, TestingModule } from "@nestjs/testing";
import { RemoveTagsTool } from "../remove-tags.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("RemoveTagsTool", () => {
  let tool: RemoveTagsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RemoveTagsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RemoveTagsTool>(RemoveTagsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should remove single tag from notes", async () => {
    const params = {
      notes: [1234567890, 1234567891],
      tags: "old-tag",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("removeTags", {
      notes: [1234567890, 1234567891],
      tags: "old-tag",
    });
    expect(result.success).toBe(true);
    expect(result.notesAffected).toBe(2);
    expect(result.tagsRemoved).toEqual(["old-tag"]);
  });

  it("should remove multiple space-separated tags", async () => {
    const params = {
      notes: [1234567890],
      tags: "deprecated obsolete",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.tagsRemoved).toEqual(["deprecated", "obsolete"]);
  });

  it("should fail when notes array is missing", async () => {
    const params = {
      notes: [] as number[],
      tags: "test",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("notes array is required");
  });
});
