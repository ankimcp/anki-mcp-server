import { Test, TestingModule } from "@nestjs/testing";
import { SetDeckLimitsTool } from "../set-deck-limits.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("SetDeckLimitsTool", () => {
  let tool: SetDeckLimitsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  const mockDeckConfig = {
    id: 1790613328103,
    name: "Default Config",
    new: {
      perDay: 20,
    },
    rev: {
      perDay: 200,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SetDeckLimitsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<SetDeckLimitsTool>(SetDeckLimitsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should successfully update newPerDay for a deck", async () => {
    const deckName = "BIOCHIMICA - ESAME DI STATO";
    const cfg = JSON.parse(JSON.stringify(mockDeckConfig));

    ankiClient.invoke
      .mockResolvedValueOnce(cfg) // getDeckConfig
      .mockResolvedValueOnce(true) // saveDeckConfig
      .mockResolvedValueOnce(null); // guiDeckBrowser

    const rawResult = await tool.execute({ deckName, newPerDay: 0 });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.deckName).toBe(deckName);
    expect(result.newPerDay).toBe(0);
    expect(result.reviewPerDay).toBe(200);
    expect(result.message).toContain("Successfully updated limits");
    expect(ankiClient.invoke).toHaveBeenCalledWith("getDeckConfig", {
      deck: deckName,
    });
    expect(ankiClient.invoke).toHaveBeenCalledWith("saveDeckConfig", {
      config: expect.objectContaining({
        new: expect.objectContaining({ perDay: 0 }),
      }),
    });
  });

  it("should successfully update reviewPerDay for a deck", async () => {
    const deckName = "BIOCHIMICA - ESAME DI STATO";
    const cfg = JSON.parse(JSON.stringify(mockDeckConfig));

    ankiClient.invoke
      .mockResolvedValueOnce(cfg)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute({ deckName, reviewPerDay: 50 });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.reviewPerDay).toBe(50);
    expect(result.newPerDay).toBe(20);
  });

  it("should successfully update both newPerDay and reviewPerDay", async () => {
    const deckName = "BIOCHIMICA - ESAME DI STATO";
    const cfg = JSON.parse(JSON.stringify(mockDeckConfig));

    ankiClient.invoke
      .mockResolvedValueOnce(cfg)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(null);

    const rawResult = await tool.execute({
      deckName,
      newPerDay: 10,
      reviewPerDay: 100,
    });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.newPerDay).toBe(10);
    expect(result.reviewPerDay).toBe(100);
  });

  it("should return error if deck config is not found", async () => {
    const deckName = "NonExistentDeck";

    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute({ deckName, newPerDay: 10 });
    const result = parseToolResult(rawResult);

    expect(result.isError).toBe(true);
    expect(result.error).toContain("Deck configuration not found");
  });

  it("should return error if neither newPerDay nor reviewPerDay is specified", async () => {
    const deckName = "TestDeck";

    const rawResult = await tool.execute({ deckName });
    const result = parseToolResult(rawResult);

    expect(result.isError).toBe(true);
    expect(result.error).toContain(
      "At least one of newPerDay or reviewPerDay must be specified",
    );
  });
});
