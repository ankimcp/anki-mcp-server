import { Test, TestingModule } from "@nestjs/testing";
import { ReviewStatsTool } from "../review-stats.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";
import { ReviewStatsResult } from "../review-stats.types";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

// Noon UTC -- ensures .toISOString().split("T")[0] and local-time "today"
// inside calculateStreak resolve to the same calendar date in any timezone.
const FAKE_NOW = Date.UTC(2026, 2, 15, 12); // 2026-03-15 12:00 UTC

describe("ReviewStatsTool", () => {
  let tool: ReviewStatsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewStatsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ReviewStatsTool>(ReviewStatsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("execute", () => {
    it("should return review stats with retention and streak", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const endDate = "2026-01-15";
      const deckName = "Default";

      ankiClient.invoke.mockImplementation((action: string, params?: any) => {
        if (action === "cardReviews") {
          // Verify deck parameter was passed
          expect(params?.deck).toBe(deckName);

          // Return review details with button presses
          // Format: [timestamp, cardId, usn, buttonPressed, ...]
          // NOTE: these mocks intentionally place reviews at exactly
          // `startTimestamp` (i=0). On the per-deck path the lower bound is
          // enforced server-side by AnkiConnect's `cardReviews` (revlog
          // `id > startID`), so the mock returns them verbatim and the
          // exclusive-boundary behavior is NOT exercised here. That boundary
          // is covered by the collection-path test
          // ("should exclude a review whose timestamp equals the window start").
          const startTimestamp = new Date(startDate).getTime();
          const reviews: any[] = [];

          // Day 1: 10 reviews (8 good, 2 again)
          for (let i = 0; i < 8; i++) {
            reviews.push([
              startTimestamp + i * 1000,
              1000 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]); // Good
          }
          for (let i = 0; i < 2; i++) {
            reviews.push([
              startTimestamp + 8000 + i * 1000,
              1008 + i,
              -1,
              1,
              4,
              -60,
              2500,
              6157,
              0,
            ]); // Again
          }

          // Day 2: 15 reviews (12 good, 2 hard, 1 easy)
          for (let i = 0; i < 12; i++) {
            reviews.push([
              startTimestamp + 86400000 + i * 1000,
              2000 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }
          for (let i = 0; i < 2; i++) {
            reviews.push([
              startTimestamp + 86400000 + 12000 + i * 1000,
              2012 + i,
              -1,
              2,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }
          reviews.push([
            startTimestamp + 86400000 + 14000,
            2014,
            -1,
            4,
            4,
            -60,
            2500,
            6157,
            0,
          ]);

          return Promise.resolve(reviews);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
        end_date: endDate,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).toHaveBeenCalledWith("cardReviews", {
        startID: new Date(startDate).getTime(),
        deck: deckName,
      });

      expect(result.period).toEqual({
        start: startDate,
        end: endDate,
      });

      expect(result.deck).toBe(deckName);

      // Check reviews by day (should only include dates in range)
      expect(result.reviews_by_day.length).toBeGreaterThan(0);
      expect(
        result.reviews_by_day.every(
          (r) => r.date >= startDate && r.date <= endDate,
        ),
      ).toBe(true);

      // Check summary
      expect(result.summary.total_reviews).toBeGreaterThan(0);
      expect(result.summary.average_per_day).toBeGreaterThan(0);
      expect(result.summary.days_studied).toBeGreaterThan(0);

      // Check retention (should have all rating counts)
      expect(result.retention.overall).toBeGreaterThan(0);
      expect(result.retention.overall).toBeLessThanOrEqual(1);
      expect(result.retention.by_rating).toEqual({
        again: expect.any(Number),
        hard: expect.any(Number),
        good: expect.any(Number),
        easy: expect.any(Number),
      });

      // Progress reporting should be called
    });

    it("should handle no reviews in date range", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const endDate = "2026-01-15";
      const deckName = "Empty";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          return Promise.resolve([]); // No reviews
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
        end_date: endDate,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.reviews_by_day).toEqual([]);
      expect(result.summary.total_reviews).toBe(0);
      expect(result.summary.days_studied).toBe(0);
      expect(result.summary.streak).toBe(0);
      expect(result.retention.overall).toBe(0);
      expect(result.retention.by_rating).toEqual({
        again: 0,
        hard: 0,
        good: 0,
        easy: 0,
      });
    });

    // Note: Date validation tests (invalid format, start > end) are handled
    // by Zod schema at the framework level (@Tool decorator) and cannot be
    // unit tested directly. These are covered by E2E tests instead.

    it("should calculate retention accurately", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const deckName = "Test";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          const startTimestamp = new Date(startDate).getTime();
          const reviews: any[] = [];

          // Create known distribution:
          // 10 Again (failed)
          // 20 Hard
          // 50 Good
          // 20 Easy
          // Total: 100, Retention: 90/100 = 0.90

          for (let i = 0; i < 10; i++) {
            reviews.push([startTimestamp + i, i, -1, 1, 4, -60, 2500, 6157, 0]); // Again
          }
          for (let i = 0; i < 20; i++) {
            reviews.push([
              startTimestamp + 10 + i,
              10 + i,
              -1,
              2,
              4,
              -60,
              2500,
              6157,
              0,
            ]); // Hard
          }
          for (let i = 0; i < 50; i++) {
            reviews.push([
              startTimestamp + 30 + i,
              30 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]); // Good
          }
          for (let i = 0; i < 20; i++) {
            reviews.push([
              startTimestamp + 80 + i,
              80 + i,
              -1,
              4,
              4,
              -60,
              2500,
              6157,
              0,
            ]); // Easy
          }

          return Promise.resolve(reviews);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.retention.overall).toBeCloseTo(0.9, 2); // 90/100 = 0.90
      expect(result.retention.by_rating).toEqual({
        again: 10,
        hard: 20,
        good: 50,
        easy: 20,
      });
    });

    it("should calculate streak accurately", async () => {
      // Pin the clock so streak date logic is deterministic
      jest.useFakeTimers({ now: FAKE_NOW });

      try {
        // Arrange
        const deckName = "Streak";
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];

        // Create dates for continuous streak
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split("T")[0];

        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

        ankiClient.invoke.mockImplementation((action: string) => {
          if (action === "cardReviews") {
            // Create reviews across 3 days
            const twoDaysAgoTimestamp = new Date(twoDaysAgoStr).getTime();
            const yesterdayTimestamp = new Date(yesterdayStr).getTime();
            const todayTimestamp = new Date(todayStr).getTime();

            const reviews: any[] = [];
            // Day 1
            for (let i = 0; i < 10; i++) {
              reviews.push([
                twoDaysAgoTimestamp + i,
                i,
                -1,
                3,
                4,
                -60,
                2500,
                6157,
                0,
              ]);
            }
            // Day 2
            for (let i = 0; i < 15; i++) {
              reviews.push([
                yesterdayTimestamp + i,
                10 + i,
                -1,
                3,
                4,
                -60,
                2500,
                6157,
                0,
              ]);
            }
            // Day 3
            for (let i = 0; i < 20; i++) {
              reviews.push([
                todayTimestamp + i,
                25 + i,
                -1,
                3,
                4,
                -60,
                2500,
                6157,
                0,
              ]);
            }

            return Promise.resolve(reviews);
          }

          return Promise.resolve({});
        });

        // Act
        const rawResult = await tool.execute({
          deck: deckName,
          start_date: twoDaysAgoStr,
        });
        const result = parseToolResult(rawResult) as ReviewStatsResult;

        // Assert - should have 3-day streak
        expect(result.summary.streak).toBe(3);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should handle broken streak", async () => {
      // Pin the clock so streak date logic is deterministic
      jest.useFakeTimers({ now: FAKE_NOW });

      try {
        // Arrange
        const deckName = "Broken";
        const today = new Date();
        const todayStr = today.toISOString().split("T")[0];

        const twoDaysAgo = new Date(today);
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
        const twoDaysAgoStr = twoDaysAgo.toISOString().split("T")[0];

        ankiClient.invoke.mockImplementation((action: string) => {
          if (action === "cardReviews") {
            // Gap in reviews (no yesterday)
            const twoDaysAgoTimestamp = new Date(twoDaysAgoStr).getTime();
            const todayTimestamp = new Date(todayStr).getTime();

            const reviews: any[] = [];
            // Day 1
            for (let i = 0; i < 10; i++) {
              reviews.push([
                twoDaysAgoTimestamp + i,
                i,
                -1,
                3,
                4,
                -60,
                2500,
                6157,
                0,
              ]);
            }
            // Day 3 (no day 2)
            for (let i = 0; i < 20; i++) {
              reviews.push([
                todayTimestamp + i,
                10 + i,
                -1,
                3,
                4,
                -60,
                2500,
                6157,
                0,
              ]);
            }

            return Promise.resolve(reviews);
          }

          return Promise.resolve({});
        });

        // Act
        const rawResult = await tool.execute({
          deck: deckName,
          start_date: twoDaysAgoStr,
        });
        const result = parseToolResult(rawResult) as ReviewStatsResult;

        // Assert - streak should be 1 (only today)
        expect(result.summary.streak).toBe(1);
      } finally {
        jest.useRealTimers();
      }
    });

    it("should filter reviews by deck correctly", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const endDate = "2026-01-11";
      const deckName = "Japanese";

      ankiClient.invoke.mockImplementation((action: string, params?: any) => {
        if (action === "getNumCardsReviewedByDay") {
          // Should NOT be called when deck filter is specified
          throw new Error(
            "getNumCardsReviewedByDay should not be called with deck filter",
          );
        }

        if (action === "cardReviews") {
          // Verify deck parameter was passed
          expect(params?.deck).toBe(deckName);

          const startTimestamp = new Date(startDate).getTime();
          const reviews: any[] = [];

          // Return reviews across two days
          // Day 1: 10 reviews
          for (let i = 0; i < 10; i++) {
            reviews.push([startTimestamp + i, i, -1, 3, 4, -60, 2500, 6157, 0]);
          }
          // Day 2: 5 reviews
          for (let i = 0; i < 5; i++) {
            reviews.push([
              startTimestamp + 86400000 + i,
              10 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }

          return Promise.resolve(reviews);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        start_date: startDate,
        end_date: endDate,
        deck: deckName,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.deck).toBe(deckName);

      // Should only call cardReviews (not getNumCardsReviewedByDay)
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).toHaveBeenCalledWith("cardReviews", {
        startID: expect.any(Number),
        deck: deckName,
      });

      // reviews_by_day should be calculated from cardReviews data
      expect(result.reviews_by_day).toHaveLength(2);
      expect(result.reviews_by_day[0].count).toBe(10);
      expect(result.reviews_by_day[1].count).toBe(5);
      expect(result.summary.total_reviews).toBe(15);
    });

    it("should extract button presses correctly from review tuples", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const deckName = "Buttons";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          const startTimestamp = new Date(startDate).getTime();

          // Button press is at index 3 in the tuple
          // [timestamp, cardId, usn, buttonPressed, newInterval, lastInterval, ease, taken, type]
          return Promise.resolve([
            [startTimestamp, 1, -1, 1, 4, -60, 2500, 100, 0], // Again
            [startTimestamp + 1, 2, -1, 2, 4, -60, 2500, 100, 0], // Hard
            [startTimestamp + 2, 3, -1, 3, 4, -60, 2500, 100, 0], // Good
            [startTimestamp + 3, 4, -1, 4, 4, -60, 2500, 100, 0], // Easy
          ]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert - each button type should be counted once
      expect(result.retention.by_rating).toEqual({
        again: 1,
        hard: 1,
        good: 1,
        easy: 1,
      });
      // Retention: 3/4 = 0.75
      expect(result.retention.overall).toBeCloseTo(0.75, 2);
    });

    it("should default end_date to today when not provided", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const deckName = "Default";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          return Promise.resolve([]);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert - end date should be set to today
      expect(result.period.start).toBe(startDate);
      expect(result.period.end).toBeTruthy();

      // Verify it's a valid date
      const endDateParsed = new Date(result.period.end);
      expect(endDateParsed).toBeInstanceOf(Date);
      expect(isNaN(endDateParsed.getTime())).toBe(false);
    });

    it("should calculate max and min days correctly", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const deckName = "MaxMin";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          const startTimestamp = new Date(startDate).getTime();
          const reviews: any[] = [];

          // Day 1: 5 reviews (min)
          for (let i = 0; i < 5; i++) {
            reviews.push([startTimestamp + i, i, -1, 3, 4, -60, 2500, 6157, 0]);
          }
          // Day 2: 15 reviews
          for (let i = 0; i < 15; i++) {
            reviews.push([
              startTimestamp + 86400000 + i,
              5 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }
          // Day 3: 25 reviews (max)
          for (let i = 0; i < 25; i++) {
            reviews.push([
              startTimestamp + 86400000 * 2 + i,
              20 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }
          // Day 4: 10 reviews
          for (let i = 0; i < 10; i++) {
            reviews.push([
              startTimestamp + 86400000 * 3 + i,
              45 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }

          return Promise.resolve(reviews);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
        end_date: "2026-01-13",
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.summary.max_day).toEqual({
        date: "2026-01-12",
        count: 25,
      });
      expect(result.summary.min_day).toEqual({
        date: "2026-01-10",
        count: 5,
      });
    });

    it("should handle zero-count days for min_day calculation", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const deckName = "ZeroDay";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          const startTimestamp = new Date(startDate).getTime();
          const reviews: any[] = [];

          // Day 1: 10 reviews
          for (let i = 0; i < 10; i++) {
            reviews.push([startTimestamp + i, i, -1, 3, 4, -60, 2500, 6157, 0]);
          }
          // Day 2: 0 reviews (should be excluded from min)
          // Day 3: 5 reviews
          for (let i = 0; i < 5; i++) {
            reviews.push([
              startTimestamp + 86400000 * 2 + i,
              10 + i,
              -1,
              3,
              4,
              -60,
              2500,
              6157,
              0,
            ]);
          }

          return Promise.resolve(reviews);
        }

        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: startDate,
        end_date: "2026-01-12",
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert - min should be 5, not 0
      expect(result.summary.min_day?.count).toBe(5);
    });

    it("should handle AnkiConnect errors gracefully", async () => {
      // Arrange
      const deckName = "Error";
      ankiClient.invoke.mockRejectedValueOnce(
        new Error("AnkiConnect: failed to fetch reviews"),
      );

      // Act
      const rawResult = await tool.execute({
        deck: deckName,
        start_date: "2026-01-10",
      });
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("failed to fetch reviews");
    });
  });

  describe("all decks (no deck filter)", () => {
    it("should aggregate reviews across the whole collection when deck is omitted", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const endDate = "2026-01-11";
      const startTs = new Date(startDate).getTime();

      ankiClient.invoke.mockImplementation((action: string, params?: any) => {
        if (action === "cardReviews") {
          throw new Error(
            "cardReviews must not be called for the all-decks path",
          );
        }
        if (action === "findCards") {
          expect(params?.query).toBe("deck:*");
          return Promise.resolve([101, 202]);
        }
        if (action === "getReviewsOfCards") {
          expect(params?.cards).toEqual([101, 202]);
          // getReviewsOfCards returns objects keyed by card id.
          // `ease` is the button pressed (1-4), `factor` is the ease factor.
          return Promise.resolve({
            "101": [
              {
                id: startTs + 1000,
                usn: -1,
                ease: 3,
                ivl: 4,
                lastIvl: -60,
                factor: 2500,
                time: 6000,
                type: 0,
              }, // good, day 1
              {
                id: startTs + 2000,
                usn: -1,
                ease: 1,
                ivl: 4,
                lastIvl: -60,
                factor: 2500,
                time: 6000,
                type: 0,
              }, // again, day 1
              {
                id: startTs - 999999,
                usn: -1,
                ease: 3,
                ivl: 4,
                lastIvl: -60,
                factor: 2500,
                time: 6000,
                type: 0,
              }, // before window -> dropped
            ],
            "202": [
              {
                id: startTs + 86400000 + 1000,
                usn: -1,
                ease: 3,
                ivl: 4,
                lastIvl: -60,
                factor: 2500,
                time: 6000,
                type: 0,
              }, // good, day 2
            ],
          });
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({
        start_date: startDate,
        end_date: endDate,
      });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.deck).toBe("All Decks");
      expect(result.reviews_by_day).toEqual([
        { date: "2026-01-10", count: 2 },
        { date: "2026-01-11", count: 1 },
      ]);
      expect(result.summary.total_reviews).toBe(3); // pre-window review dropped
      expect(result.retention.by_rating).toEqual({
        again: 1,
        hard: 0,
        good: 2,
        easy: 0,
      });
      expect(ankiClient.invoke).toHaveBeenCalledWith("findCards", {
        query: "deck:*",
      });
      expect(ankiClient.invoke).toHaveBeenCalledWith("getReviewsOfCards", {
        cards: [101, 202],
      });
    });

    it("should exclude a review whose timestamp equals the window start (exclusive lower bound)", async () => {
      // Arrange
      // AnkiConnect's cardReviews uses a STRICT lower bound (revlog `id > startID`),
      // so a review at exactly startTimestamp must NOT be counted on the
      // collection-wide path either.
      const startDate = "2026-01-10";
      const startTs = new Date(startDate).getTime();

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          throw new Error(
            "cardReviews must not be called for the all-decks path",
          );
        }
        if (action === "findCards") return Promise.resolve([101]);
        if (action === "getReviewsOfCards") {
          return Promise.resolve({
            "101": [
              {
                id: startTs, // exactly at the window start -> excluded
                usn: -1,
                ease: 3,
                ivl: 4,
                lastIvl: -60,
                factor: 2500,
                time: 6000,
                type: 0,
              },
              {
                id: startTs + 1000, // strictly inside the window -> included
                usn: -1,
                ease: 3,
                ivl: 4,
                lastIvl: -60,
                factor: 2500,
                time: 6000,
                type: 0,
              },
            ],
          });
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ start_date: startDate });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert - only the strictly-after-start review is counted
      expect(result.summary.total_reviews).toBe(1);
      expect(result.reviews_by_day).toEqual([
        { date: "2026-01-10", count: 1 },
      ]);
    });

    it("should treat an empty-string deck as all decks", async () => {
      // Arrange
      const startDate = "2026-01-10";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          throw new Error(
            "cardReviews must not be called for the all-decks path",
          );
        }
        if (action === "findCards") return Promise.resolve([]);
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ deck: "", start_date: startDate });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.deck).toBe("All Decks");
      expect(result.reviews_by_day).toEqual([]);
      expect(result.summary.total_reviews).toBe(0);
    });

    it("should return empty stats when the collection has no cards", async () => {
      // Arrange
      const startDate = "2026-01-10";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "findCards") return Promise.resolve([]);
        if (action === "getReviewsOfCards") {
          throw new Error("should not fetch reviews when there are no cards");
        }
        return Promise.resolve({});
      });

      // Act
      const rawResult = await tool.execute({ start_date: startDate });
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert
      expect(result.summary.total_reviews).toBe(0);
      expect(result.retention.overall).toBe(0);
    });
  });
});
