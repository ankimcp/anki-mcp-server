import { Test, TestingModule } from "@nestjs/testing";
import { DeckStatsTool } from "../deck-stats.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import type { DeckStatsResult } from "../deckActions/actions/deckStats.action";

jest.mock("@/mcp/clients/anki-connect.client");

describe("DeckStatsTool", () => {
  let tool: DeckStatsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeckStatsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<DeckStatsTool>(DeckStatsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should return deck stats with distributions", async () => {
    const deckName = "Test Deck";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({ [deckName]: 1234567890 });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "1234567890": {
            deck_id: 1234567890,
            name: deckName,
            new_count: 10,
            learn_count: 5,
            review_count: 20,
            total_in_deck: 35,
          },
        });
      }
      if (action === "findCards") {
        return Promise.resolve(Array.from({ length: 35 }, (_, i) => i + 1));
      }
      if (action === "getEaseFactors") {
        return Promise.resolve([
          ...Array(10).fill(0),
          ...Array(5).fill(2100),
          ...Array(10).fill(2500),
          ...Array(10).fill(3000),
        ]);
      }
      if (action === "getIntervals") {
        return Promise.resolve([
          ...Array(10).fill(0),
          ...Array(5).fill(-14400),
          ...Array(10).fill(15),
          ...Array(10).fill(45),
        ]);
      }
      return Promise.resolve({});
    });

    const rawResult = await tool.execute({ deck: deckName }, mockContext);
    const result = parseToolResult(rawResult) as DeckStatsResult;

    expect(ankiClient.invoke).toHaveBeenCalledTimes(5);
    expect(result.deck).toBe(deckName);
    expect(result.counts).toEqual({
      total: 35,
      new: 10,
      learning: 5,
      review: 20,
    });
    expect(result.ease.count).toBe(25);
    expect(result.intervals.count).toBe(20);
  });

  it("should resolve child deck stats by ID when getDeckStats returns short name", async () => {
    const fullDeckName = "Test::STDIO-AddNotes";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({
          Test: 1111111111,
          "Test::STDIO-AddNotes": 2222222222,
        });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "2222222222": {
            deck_id: 2222222222,
            name: "STDIO-AddNotes",
            new_count: 5,
            learn_count: 2,
            review_count: 8,
            total_in_deck: 15,
          },
        });
      }
      if (action === "findCards") {
        return Promise.resolve(Array.from({ length: 15 }, (_, i) => i + 1));
      }
      if (action === "getEaseFactors") {
        return Promise.resolve(Array(15).fill(2500));
      }
      if (action === "getIntervals") {
        return Promise.resolve(Array(15).fill(10));
      }
      return Promise.resolve({});
    });

    const rawResult = await tool.execute({ deck: fullDeckName }, mockContext);
    const result = parseToolResult(rawResult) as DeckStatsResult;

    expect(result.deck).toBe(fullDeckName);
    expect(result.counts.total).toBe(15);
    expect(result.counts.new).toBe(5);
    expect(result.counts.learning).toBe(2);
    expect(result.counts.review).toBe(8);
  });

  it("should handle deck not found", async () => {
    ankiClient.invoke.mockResolvedValueOnce({});

    const rawResult = await tool.execute({ deck: "NonExistent" }, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("should handle empty deck", async () => {
    const deckName = "Empty Deck";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({ [deckName]: 1234567890 });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "1234567890": {
            deck_id: 1234567890,
            name: deckName,
            new_count: 0,
            learn_count: 0,
            review_count: 0,
            total_in_deck: 0,
          },
        });
      }
      return Promise.resolve({});
    });

    const rawResult = await tool.execute({ deck: deckName }, mockContext);
    const result = parseToolResult(rawResult) as DeckStatsResult;

    expect(result.deck).toBe(deckName);
    expect(result.counts.total).toBe(0);
    expect(result.ease.count).toBe(0);
    expect(result.intervals.count).toBe(0);
  });

  it("should use custom bucket boundaries", async () => {
    const deckName = "Custom Buckets";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({ [deckName]: 1234567890 });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "1234567890": {
            deck_id: 1234567890,
            name: deckName,
            new_count: 0,
            learn_count: 0,
            review_count: 10,
            total_in_deck: 10,
          },
        });
      }
      if (action === "findCards") {
        return Promise.resolve(Array.from({ length: 10 }, (_, i) => i + 1));
      }
      if (action === "getEaseFactors") {
        return Promise.resolve(Array(10).fill(2000));
      }
      if (action === "getIntervals") {
        return Promise.resolve(Array(10).fill(30));
      }
      return Promise.resolve({});
    });

    const rawResult = await tool.execute(
      {
        deck: deckName,
        easeBuckets: [1.5, 2.0, 2.5],
        intervalBuckets: [14, 30, 60],
      },
      mockContext,
    );
    const result = parseToolResult(rawResult) as DeckStatsResult;

    expect(result.ease.buckets).toBeDefined();
    expect(result.intervals.buckets).toBeDefined();

    const easeBucketKeys = Object.keys(result.ease.buckets);
    expect(easeBucketKeys.some((k) => k.includes("1.5"))).toBe(true);

    const intervalBucketKeys = Object.keys(result.intervals.buckets);
    expect(intervalBucketKeys.some((k) => k.includes("14"))).toBe(true);
  });

  it("should correctly divide ease factors by 1000", async () => {
    const deckName = "Ease Factor Test";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({ [deckName]: 1234567890 });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "1234567890": {
            deck_id: 1234567890,
            name: deckName,
            new_count: 0,
            learn_count: 0,
            review_count: 3,
            total_in_deck: 3,
          },
        });
      }
      if (action === "findCards") {
        return Promise.resolve([1, 2, 3]);
      }
      if (action === "getEaseFactors") {
        return Promise.resolve([4100, 2500, 3000]);
      }
      if (action === "getIntervals") {
        return Promise.resolve([10, 20, 30]);
      }
      return Promise.resolve({});
    });

    const rawResult = await tool.execute({ deck: deckName }, mockContext);
    const result = parseToolResult(rawResult) as DeckStatsResult;

    expect(result.ease.count).toBe(3);
    expect(result.ease.mean).toBeCloseTo(3.2, 1);
    expect(result.ease.max).toBeCloseTo(4.1, 1);
    expect(result.ease.min).toBeCloseTo(2.5, 1);
  });

  it("should filter out negative intervals (learning cards)", async () => {
    const deckName = "Mixed Intervals";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({ [deckName]: 1234567890 });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "1234567890": {
            deck_id: 1234567890,
            name: deckName,
            new_count: 0,
            learn_count: 5,
            review_count: 10,
            total_in_deck: 15,
          },
        });
      }
      if (action === "findCards") {
        return Promise.resolve(Array.from({ length: 15 }, (_, i) => i + 1));
      }
      if (action === "getEaseFactors") {
        return Promise.resolve(Array(15).fill(2500));
      }
      if (action === "getIntervals") {
        return Promise.resolve([
          ...Array(5).fill(-7200),
          ...Array(10).fill(25),
        ]);
      }
      return Promise.resolve({});
    });

    const rawResult = await tool.execute({ deck: deckName }, mockContext);
    const result = parseToolResult(rawResult) as DeckStatsResult;

    expect(result.intervals.count).toBe(10);
    expect(result.intervals.mean).toBe(25);
  });

  it("should report progress", async () => {
    const deckName = "Test Deck";

    ankiClient.invoke.mockImplementation((action: string) => {
      if (action === "deckNamesAndIds") {
        return Promise.resolve({ [deckName]: 1234567890 });
      }
      if (action === "getDeckStats") {
        return Promise.resolve({
          "1234567890": {
            deck_id: 1234567890,
            name: deckName,
            new_count: 0,
            learn_count: 0,
            review_count: 5,
            total_in_deck: 5,
          },
        });
      }
      if (action === "findCards") {
        return Promise.resolve([1, 2, 3, 4, 5]);
      }
      if (action === "getEaseFactors") {
        return Promise.resolve(Array(5).fill(2500));
      }
      if (action === "getIntervals") {
        return Promise.resolve(Array(5).fill(10));
      }
      return Promise.resolve({});
    });

    await tool.execute({ deck: deckName }, mockContext);

    expect(mockContext.reportProgress).toHaveBeenCalled();
    const calls = mockContext.reportProgress.mock.calls;
    expect(calls.length).toBeGreaterThan(1);

    expect(calls[0][0]).toEqual({ progress: 10, total: 100 });
    expect(calls[calls.length - 1][0]).toEqual({ progress: 100, total: 100 });
  });
});
