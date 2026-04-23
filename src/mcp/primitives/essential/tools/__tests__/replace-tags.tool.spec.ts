import { Test, TestingModule } from "@nestjs/testing";
import { ReplaceTagsTool } from "../replace-tags.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("ReplaceTagsTool", () => {
  let tool: ReplaceTagsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReplaceTagsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ReplaceTagsTool>(ReplaceTagsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should replace tag in notes", async () => {
    const params = {
      notes: [1234567890, 1234567891, 1234567892],
      tagToReplace: "RomanEmpire",
      replaceWithTag: "roman-empire",
    };
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

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
    const params = {
      notes: [1234567890],
      tagToReplace: "",
      replaceWithTag: "new-tag",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("tagToReplace is required");
  });

  it("should fail when replaceWithTag is missing", async () => {
    const params = {
      notes: [1234567890],
      tagToReplace: "old-tag",
      replaceWithTag: "",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("replaceWithTag is required");
  });

  it("should fail when tag contains spaces", async () => {
    const params = {
      notes: [1234567890],
      tagToReplace: "old tag",
      replaceWithTag: "new-tag",
    };

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot contain spaces");
  });
});
