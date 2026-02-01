/**
 * E2E tests for Stats Tools - HTTP Streamable transport
 *
 * Tests deck_stats, collection_stats, and review_stats tools against
 * a real Anki instance via Docker.
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - HTTP server running: npm run start:prod:http
 */
import { callTool, setTransport, getTransport, waitForServer } from "./helpers";

/** Generate unique suffix to avoid duplicate conflicts */
function uniqueId(): string {
  return String(Date.now()).slice(-8);
}

/**
 * Test fixtures for stats testing
 */
interface StatsTestFixture {
  deckName: string;
  noteIds: number[];
  cardIds: number[];
}

/**
 * Create a test deck with known card distribution for stats testing
 */
async function createStatsTestDeck(uid: string): Promise<StatsTestFixture> {
  const deckName = `STATS_HTTP_E2E_${uid}`;

  // Create test deck
  const deckResult = callTool("create_deck", { deck_name: deckName });
  expect(deckResult).toHaveProperty("deckId");

  const noteIds: number[] = [];
  const cardIds: number[] = [];

  // Create multiple notes to get meaningful statistics
  // We'll create 10 cards with Basic model (1 card per note)
  for (let i = 0; i < 10; i++) {
    const noteResult = callTool("addNote", {
      deckName: deckName,
      modelName: "Basic",
      fields: {
        Front: `Stats Test Front ${uid}-${i}`,
        Back: `Stats Test Back ${uid}-${i}`,
      },
      tags: [`stats-http-e2e-${uid}`],
    });

    expect(noteResult).toHaveProperty("noteId");
    const noteId = noteResult.noteId as number;
    noteIds.push(noteId);

    // Get card IDs for this note
    const infoResult = callTool("notesInfo", { notes: [noteId] });
    const notes = infoResult.notes as Array<{ cards: number[] }>;
    cardIds.push(...notes[0].cards);
  }

  return { deckName, noteIds, cardIds };
}

describe("E2E: Stats Tools (HTTP Streamable)", () => {
  let testDeck1: StatsTestFixture;
  let testDeck2: StatsTestFixture;

  beforeAll(async () => {
    setTransport("http");
    expect(getTransport()).toBe("http");

    const ready = await waitForServer(60);
    if (!ready) {
      throw new Error("MCP server not ready after 60 seconds");
    }

    // Create test fixtures
    const uid1 = uniqueId();
    const uid2 = String(Number(uid1) + 1).slice(-8);

    testDeck1 = await createStatsTestDeck(uid1);
    testDeck2 = await createStatsTestDeck(uid2);
  }, 90000);

  // No cleanup needed - Docker container is one-time use

  describe("deck_stats", () => {
    it("should return correct structure for test deck", () => {
      const result = callTool("deck_stats", { deck: testDeck1.deckName });

      // Verify structure
      expect(result).toHaveProperty("deck", testDeck1.deckName);
      expect(result).toHaveProperty("counts");
      expect(result).toHaveProperty("ease");
      expect(result).toHaveProperty("intervals");

      // Verify counts structure
      const counts = result.counts as Record<string, number>;
      expect(counts).toHaveProperty("total");
      expect(counts).toHaveProperty("new");
      expect(counts).toHaveProperty("learning");
      expect(counts).toHaveProperty("review");

      // Verify distribution structure
      const ease = result.ease as Record<string, unknown>;
      expect(ease).toHaveProperty("mean");
      expect(ease).toHaveProperty("median");
      expect(ease).toHaveProperty("min");
      expect(ease).toHaveProperty("max");
      expect(ease).toHaveProperty("count");
      expect(ease).toHaveProperty("buckets");

      const intervals = result.intervals as Record<string, unknown>;
      expect(intervals).toHaveProperty("mean");
      expect(intervals).toHaveProperty("median");
      expect(intervals).toHaveProperty("min");
      expect(intervals).toHaveProperty("max");
      expect(intervals).toHaveProperty("count");
      expect(intervals).toHaveProperty("buckets");
    });

    it("should return correct card counts for test deck", () => {
      const result = callTool("deck_stats", { deck: testDeck1.deckName });

      const counts = result.counts as Record<string, number>;

      // We created 10 Basic notes, each creates 1 card
      expect(counts.total).toBe(10);

      // All cards should be new (never studied)
      expect(counts.new).toBe(10);
      expect(counts.learning).toBe(0);
      expect(counts.review).toBe(0);
    });

    it("should handle new cards with no ease data", () => {
      const result = callTool("deck_stats", { deck: testDeck1.deckName });

      const ease = result.ease as Record<string, unknown>;

      // New cards don't have ease factors yet
      expect(ease.count).toBe(0);
      expect(ease.mean).toBe(0);
      expect(ease.median).toBe(0);
      expect(ease.min).toBe(0);
      expect(ease.max).toBe(0);

      // Buckets should be empty or have zero counts
      const buckets = ease.buckets as Record<string, number>;
      expect(buckets).toBeDefined();
    });

    it("should handle new cards with no interval data", () => {
      const result = callTool("deck_stats", { deck: testDeck1.deckName });

      const intervals = result.intervals as Record<string, unknown>;

      // New cards don't have intervals yet (not in review)
      expect(intervals.count).toBe(0);
      expect(intervals.mean).toBe(0);
      expect(intervals.median).toBe(0);
      expect(intervals.min).toBe(0);
      expect(intervals.max).toBe(0);

      // Buckets should be empty
      const buckets = intervals.buckets as Record<string, number>;
      expect(buckets).toBeDefined();
    });

    it("should accept custom ease buckets", () => {
      const result = callTool("deck_stats", {
        deck: testDeck1.deckName,
        ease_buckets: [2.0, 3.0],
      });

      expect(result).toHaveProperty("ease");
      const ease = result.ease as Record<string, unknown>;
      expect(ease).toHaveProperty("buckets");

      // Should have buckets based on custom boundaries: <2.0, 2.0-3.0, >3.0
      const buckets = ease.buckets as Record<string, number>;
      expect(buckets).toBeDefined();
    });

    it("should accept custom interval buckets", () => {
      const result = callTool("deck_stats", {
        deck: testDeck1.deckName,
        interval_buckets: [14, 30, 60],
      });

      expect(result).toHaveProperty("intervals");
      const intervals = result.intervals as Record<string, unknown>;
      expect(intervals).toHaveProperty("buckets");

      // Should have buckets based on custom boundaries
      const buckets = intervals.buckets as Record<string, number>;
      expect(buckets).toBeDefined();
    });

    it("should return empty stats for non-existent deck", () => {
      // Note: AnkiConnect's getDeckStats returns empty stats for non-existent decks
      // rather than throwing an error
      const result = callTool("deck_stats", {
        deck: `NONEXISTENT_DECK_${uniqueId()}`,
      });

      // Should return stats with zero counts
      expect(result).toHaveProperty("counts");
      const counts = result.counts as Record<string, number>;
      expect(counts.total).toBe(0);
      expect(counts.new).toBe(0);
      expect(counts.learning).toBe(0);
      expect(counts.review).toBe(0);
    });
  });

  describe("collection_stats", () => {
    it("should return correct structure for collection", () => {
      const result = callTool("collection_stats");

      // Verify structure
      expect(result).toHaveProperty("total_decks");
      expect(result).toHaveProperty("counts");
      expect(result).toHaveProperty("ease");
      expect(result).toHaveProperty("intervals");
      expect(result).toHaveProperty("per_deck");

      // Verify counts structure
      const counts = result.counts as Record<string, number>;
      expect(counts).toHaveProperty("total");
      expect(counts).toHaveProperty("new");
      expect(counts).toHaveProperty("learning");
      expect(counts).toHaveProperty("review");

      // Verify per_deck array
      const perDeck = result.per_deck as Array<unknown>;
      expect(Array.isArray(perDeck)).toBe(true);
      expect(perDeck.length).toBeGreaterThan(0);
    });

    it("should include test decks in collection stats", () => {
      const result = callTool("collection_stats");

      const perDeck = result.per_deck as Array<{
        deck: string;
        total: number;
        new: number;
        learning: number;
        review: number;
      }>;

      // Find our test decks
      const deck1Stats = perDeck.find((d) => d.deck === testDeck1.deckName);
      const deck2Stats = perDeck.find((d) => d.deck === testDeck2.deckName);

      expect(deck1Stats).toBeDefined();
      expect(deck2Stats).toBeDefined();

      // Verify counts
      if (deck1Stats) {
        expect(deck1Stats.total).toBe(10);
        expect(deck1Stats.new).toBe(10);
      }

      if (deck2Stats) {
        expect(deck2Stats.total).toBe(10);
        expect(deck2Stats.new).toBe(10);
      }
    });

    it("should aggregate counts correctly", () => {
      const result = callTool("collection_stats");

      const counts = result.counts as Record<string, number>;
      const perDeck = result.per_deck as Array<{
        total: number;
        new: number;
        learning: number;
        review: number;
      }>;

      // Collection totals should be at least the sum of our test decks
      const testDeckTotals = perDeck
        .filter(
          (d) =>
            "deck" in d &&
            (d.deck === testDeck1.deckName || d.deck === testDeck2.deckName),
        )
        .reduce(
          (acc, d) => ({
            total: acc.total + d.total,
            new: acc.new + d.new,
            learning: acc.learning + d.learning,
            review: acc.review + d.review,
          }),
          { total: 0, new: 0, learning: 0, review: 0 },
        );

      expect(counts.total).toBeGreaterThanOrEqual(testDeckTotals.total);
      expect(counts.new).toBeGreaterThanOrEqual(testDeckTotals.new);
    });

    it("should accept custom ease buckets", () => {
      const result = callTool("collection_stats", {
        ease_buckets: [2.0, 3.0],
      });

      expect(result).toHaveProperty("ease");
      const ease = result.ease as Record<string, unknown>;
      expect(ease).toHaveProperty("buckets");
    });

    it("should accept custom interval buckets", () => {
      const result = callTool("collection_stats", {
        interval_buckets: [14, 30, 60],
      });

      expect(result).toHaveProperty("intervals");
      const intervals = result.intervals as Record<string, unknown>;
      expect(intervals).toHaveProperty("buckets");
    });
  });

  describe("review_stats", () => {
    it("should return correct structure for date range", () => {
      // Test with a recent date range (last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const result = callTool("review_stats", {
        deck: testDeck1.deckName,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
      });

      // Verify structure
      expect(result).toHaveProperty("period");
      expect(result).toHaveProperty("deck");
      expect(result).toHaveProperty("reviews_by_day");
      expect(result).toHaveProperty("summary");
      expect(result).toHaveProperty("retention");

      // Verify period structure
      const period = result.period as Record<string, string>;
      expect(period).toHaveProperty("start");
      expect(period).toHaveProperty("end");

      // Verify summary structure
      const summary = result.summary as Record<string, unknown>;
      expect(summary).toHaveProperty("total_reviews");
      expect(summary).toHaveProperty("average_per_day");
      expect(summary).toHaveProperty("days_studied");
      expect(summary).toHaveProperty("max_day");
      expect(summary).toHaveProperty("min_day");
      expect(summary).toHaveProperty("streak");

      // Verify retention structure
      const retention = result.retention as Record<string, unknown>;
      expect(retention).toHaveProperty("overall");
      expect(retention).toHaveProperty("by_rating");

      const byRating = retention.by_rating as Record<string, number>;
      expect(byRating).toHaveProperty("again");
      expect(byRating).toHaveProperty("hard");
      expect(byRating).toHaveProperty("good");
      expect(byRating).toHaveProperty("easy");

      // Verify reviews_by_day array
      const reviewsByDay = result.reviews_by_day as Array<unknown>;
      expect(Array.isArray(reviewsByDay)).toBe(true);
    });

    it("should accept deck filter", () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const result = callTool("review_stats", {
        deck: testDeck1.deckName,
        start_date: startDate.toISOString().split("T")[0],
      });

      expect(result).toHaveProperty("deck", testDeck1.deckName);
      expect(result).toHaveProperty("period");
      expect(result).toHaveProperty("reviews_by_day");
    });

    it("should handle no reviews in date range", () => {
      // Use a date range in the far future where no reviews exist
      const result = callTool("review_stats", {
        deck: testDeck1.deckName,
        start_date: "2099-01-01",
        end_date: "2099-12-31",
      });

      const summary = result.summary as Record<string, unknown>;
      expect(summary.total_reviews).toBe(0);
      expect(summary.days_studied).toBe(0);
      expect(summary.streak).toBe(0);

      const retention = result.retention as Record<string, unknown>;
      expect(retention.overall).toBe(0);
    });

    it("should validate date format", () => {
      // Validation errors return a response with error text instead of throwing
      const result = callTool("review_stats", {
        deck: testDeck1.deckName,
        start_date: "invalid-date",
      });

      const text = result.text as string;
      expect(text).toMatch(/date|format|iso|invalid/i);
    });

    it("should default end_date to today when omitted", () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const result = callTool("review_stats", {
        deck: testDeck1.deckName,
        start_date: startDate.toISOString().split("T")[0],
      });

      const period = result.period as Record<string, string>;
      expect(period).toHaveProperty("start");
      expect(period).toHaveProperty("end");

      // End date should be today or very recent
      const endDate = new Date(period.end);
      const today = new Date();
      const daysDiff = Math.abs(
        (endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      expect(daysDiff).toBeLessThan(2); // Allow for timezone differences
    });

    it("should require deck parameter", () => {
      // Validation errors return a response with error text instead of throwing
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const result = callTool("review_stats", {
        start_date: startDate.toISOString().split("T")[0],
      });

      const text = result.text as string;
      expect(text).toMatch(/deck|required|invalid/i);
    });
  });

  describe("Integration: Stats Tools Working Together", () => {
    it("deck_stats and collection_stats should have consistent counts", () => {
      const deckStats = callTool("deck_stats", { deck: testDeck1.deckName });
      const collectionStats = callTool("collection_stats");

      // Find test deck in collection stats
      const perDeck = collectionStats.per_deck as Array<{
        deck: string;
        total: number;
        new: number;
        learning: number;
        review: number;
      }>;

      const deck1InCollection = perDeck.find(
        (d) => d.deck === testDeck1.deckName,
      );
      expect(deck1InCollection).toBeDefined();

      // Counts should match
      const deckCounts = deckStats.counts as Record<string, number>;
      if (deck1InCollection) {
        expect(deck1InCollection.total).toBe(deckCounts.total);
        expect(deck1InCollection.new).toBe(deckCounts.new);
        expect(deck1InCollection.learning).toBe(deckCounts.learning);
        expect(deck1InCollection.review).toBe(deckCounts.review);
      }
    });

    it("collection_stats should include both test decks", () => {
      const collectionStats = callTool("collection_stats");

      const perDeck = collectionStats.per_deck as Array<{
        deck: string;
        total: number;
      }>;

      const testDeckNames = [testDeck1.deckName, testDeck2.deckName];
      const foundDecks = perDeck.filter((d) => testDeckNames.includes(d.deck));

      expect(foundDecks.length).toBe(2);
    });
  });
});
