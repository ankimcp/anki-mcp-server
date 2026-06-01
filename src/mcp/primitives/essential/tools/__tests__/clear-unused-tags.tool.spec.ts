import { Test, TestingModule } from "@nestjs/testing";
import { ClearUnusedTagsTool } from "../clear-unused-tags.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("ClearUnusedTagsTool", () => {
  let tool: ClearUnusedTagsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClearUnusedTagsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ClearUnusedTagsTool>(ClearUnusedTagsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should clear unused tags", async () => {
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute({});
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("clearUnusedTags");
    expect(result.success).toBe(true);
    expect(result.message).toContain("Successfully cleared unused tags");
  });

  it("should report progress", async () => {
    ankiClient.invoke.mockResolvedValueOnce(null);

    await tool.execute({});
  });
});
