import { Test, TestingModule } from "@nestjs/testing";
import { ReviewStatsTool } from "../review-stats.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";
import { ReviewStatsResult } from "../review-stats.types";

// Mock the AnkiConnectClient
jest.mock("@/mcp/clients/anki-connect.client");

describe("ReviewStatsTool", () => {
  let tool: ReviewStatsTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReviewStatsTool, AnkiConnectClient],
    }).compile();

    tool = module.get<ReviewStatsTool>(ReviewStatsTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    // Setup mock context
    mockContext = createMockContext();

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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate, end_date: endDate },
        mockContext,
      );
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
      expect(mockContext.reportProgress).toHaveBeenCalled();
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate, end_date: endDate },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: twoDaysAgoStr },
        mockContext,
      );
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert - should have 3-day streak
      expect(result.summary.streak).toBe(3);
    });

    it("should handle broken streak", async () => {
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: twoDaysAgoStr },
        mockContext,
      );
      const result = parseToolResult(rawResult) as ReviewStatsResult;

      // Assert - streak should be 1 (only today)
      expect(result.summary.streak).toBe(1);
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
      const rawResult = await tool.execute(
        { start_date: startDate, end_date: endDate, deck: deckName },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate, end_date: "2026-01-13" },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: startDate, end_date: "2026-01-12" },
        mockContext,
      );
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
      const rawResult = await tool.execute(
        { deck: deckName, start_date: "2026-01-10" },
        mockContext,
      );
      const result = parseToolResult(rawResult);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("failed to fetch reviews");
    });

    it("should call reportProgress correctly", async () => {
      // Arrange
      const startDate = "2026-01-10";
      const deckName = "Progress";

      ankiClient.invoke.mockImplementation((action: string) => {
        if (action === "cardReviews") {
          return Promise.resolve([]);
        }

        return Promise.resolve({});
      });

      // Act
      await tool.execute(
        { deck: deckName, start_date: startDate },
        mockContext,
      );

      // Assert
      expect(mockContext.reportProgress).toHaveBeenCalled();
      const calls = mockContext.reportProgress.mock.calls;

      // Should have multiple progress updates
      expect(calls.length).toBeGreaterThan(1);

      // First call should be 10%
      expect(calls[0][0]).toEqual({ progress: 10, total: 100 });

      // Last call should be 100%
      expect(calls[calls.length - 1][0]).toEqual({ progress: 100, total: 100 });
    });
  });
});
