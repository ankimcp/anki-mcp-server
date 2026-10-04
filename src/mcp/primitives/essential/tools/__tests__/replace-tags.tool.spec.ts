import { Test, TestingModule } from "@nestjs/testing";
import { ReplaceTagsTool } from "../replace-tags.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("ReplaceTagsTool", () => {
  let tool: ReplaceTagsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReplaceTagsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ReplaceTagsTool>(ReplaceTagsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should replace tag in notes", async () => {
    const params = {
      notes: [1234567890, 1234567891, 1234567892],
      tagToReplace: "RomanEmpire",
      replaceWithTag: "roman-empire",
    };
    ankiClient.invoke
      .mockResolvedValueOnce([
        { noteId: 1234567890, tags: ["RomanEmpire"] },
        { noteId: 1234567891, tags: ["RomanEmpire", "history"] },
        { noteId: 1234567892, tags: ["RomanEmpire"] },
      ]) // notesInfo
      .mockResolvedValueOnce(null); // replaceTags

    const rawResult = await tool.execute(params);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("notesInfo", {
      notes: [1234567890, 1234567891, 1234567892],
    });
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

  it("should count only notes that carried the tag, case-insensitively", async () => {
    const params = {
      notes: [1, 2, 3, 4],
      tagToReplace: "RomanEmpire",
      replaceWithTag: "roman-empire",
    };
    ankiClient.invoke
      .mockResolvedValueOnce([
        { noteId: 1, tags: ["romanempire"] },
        { noteId: 2, tags: ["other"] },
        { noteId: 3, tags: [] },
        {}, // missing note
      ]) // notesInfo
      .mockResolvedValueOnce(null); // replaceTags

    const rawResult = await tool.execute(params);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.notesAffected).toBe(1);
    expect(result.message).toContain("1 of 4");
  });

  it("should report zero affected notes when none carried the tag", async () => {
    const params = {
      notes: [1, 2],
      tagToReplace: "absent",
      replaceWithTag: "new-tag",
    };
    ankiClient.invoke
      .mockResolvedValueOnce([
        { noteId: 1, tags: ["a"] },
        { noteId: 2, tags: ["b"] },
      ]) // notesInfo
      .mockResolvedValueOnce(null); // replaceTags

    const rawResult = await tool.execute(params);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.notesAffected).toBe(0);
    expect(result.message).toContain("nothing was replaced");
  });

  it("should not double-count duplicate note IDs", async () => {
    const params = {
      notes: [1, 1],
      tagToReplace: "old",
      replaceWithTag: "new",
    };
    ankiClient.invoke
      .mockResolvedValueOnce([
        { noteId: 1, tags: ["old"] },
        { noteId: 1, tags: ["old"] },
      ]) // notesInfo
      .mockResolvedValueOnce(null); // replaceTags

    const result = parseToolResult(await tool.execute(params));

    expect(result.notesAffected).toBe(1);
  });

  it("should fail when tagToReplace is missing", async () => {
    const params = {
      notes: [1234567890],
      tagToReplace: "",
      replaceWithTag: "new-tag",
    };

    const rawResult = await tool.execute(params);
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

    const rawResult = await tool.execute(params);
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

    const rawResult = await tool.execute(params);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot contain spaces");
  });
});
