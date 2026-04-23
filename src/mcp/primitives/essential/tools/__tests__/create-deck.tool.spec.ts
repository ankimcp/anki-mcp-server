import { Test, TestingModule } from "@nestjs/testing";
import { CreateDeckTool } from "../create-deck.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("CreateDeckTool", () => {
  let tool: CreateDeckTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CreateDeckTool, AnkiConnectClient],
    }).compile();

    tool = module.get<CreateDeckTool>(CreateDeckTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should successfully create a simple deck", async () => {
    const deckName = "Spanish Vocabulary";
    const deckId = 1651445861967;

    ankiClient.invoke.mockResolvedValueOnce(deckId);

    const rawResult = await tool.execute({ deckName }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.deckId).toBe(deckId);
    expect(result.deckName).toBe(deckName);
    expect(result.message).toContain("Successfully created");
    expect(ankiClient.invoke).toHaveBeenCalledWith("createDeck", {
      deck: deckName,
    });
  });

  it("should create a parent::child deck structure", async () => {
    const deckName = "Languages::Spanish";
    const deckId = 1651445861971;

    ankiClient.invoke.mockResolvedValueOnce(deckId);

    const rawResult = await tool.execute({ deckName }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.parentDeck).toBe("Languages");
    expect(result.childDeck).toBe("Spanish");
    expect(result.message).toContain('parent deck "Languages"');
  });

  it("should reject deck with more than 2 levels", async () => {
    const deckName = "Languages::Spanish::Vocabulary";

    const rawResult = await tool.execute({ deckName }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("maximum 2 levels");
    expect(ankiClient.invoke).not.toHaveBeenCalled();
  });

  it("should reject deck name with empty parts", async () => {
    const rawResult = await tool.execute(
      { deckName: "::InvalidDeck" },
      mockContext,
    );
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("empty");
    expect(ankiClient.invoke).not.toHaveBeenCalled();
  });

  it("should handle deck already exists scenario", async () => {
    const deckName = "Existing Deck";

    ankiClient.invoke
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([deckName, "Other Deck"]);

    const rawResult = await tool.execute({ deckName }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.message).toContain("already exists");
    expect(result.created).toBe(false);
    expect(result.exists).toBe(true);
  });

  it("should handle AnkiConnect errors", async () => {
    ankiClient.invoke.mockRejectedValueOnce(new Error("AnkiConnect error"));

    const rawResult = await tool.execute(
      { deckName: "Test Deck" },
      mockContext,
    );
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("AnkiConnect error");
  });

  it("should report progress", async () => {
    ankiClient.invoke.mockResolvedValueOnce(123456);

    await tool.execute({ deckName: "Test Deck" }, mockContext);

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
