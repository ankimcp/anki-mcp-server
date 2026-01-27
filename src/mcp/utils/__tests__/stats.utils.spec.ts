/**
 * Unit tests for statistical utilities
 */

import {
  calculateStreak,
  computeDistribution,
  computeRetention,
  type BucketConfig,
} from "../stats.utils";

describe("computeDistribution", () => {
  describe("empty array handling", () => {
    it("should return zero metrics with empty buckets for empty array", () => {
      const config: BucketConfig = {
        boundaries: [2.0, 2.5, 3.0],
      };

      const result = computeDistribution([], config);

      expect(result).toEqual({
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        count: 0,
        buckets: {
          "<2": 0,
          "2-2.5": 0,
          "2.5-3": 0,
          ">3": 0,
        },
      });
    });

    it("should handle empty boundaries", () => {
      const config: BucketConfig = {
        boundaries: [],
      };

      const result = computeDistribution([], config);

      expect(result).toEqual({
        mean: 0,
        median: 0,
        min: 0,
        max: 0,
        count: 0,
        buckets: {},
      });
    });
  });

  describe("single value", () => {
    it("should handle single value correctly", () => {
      const config: BucketConfig = {
        boundaries: [2.0, 2.5, 3.0],
      };

      const result = computeDistribution([2.3], config);

      expect(result).toEqual({
        mean: 2.3,
        median: 2.3,
        min: 2.3,
        max: 2.3,
        count: 1,
        buckets: {
          "<2": 0,
          "2-2.5": 1,
          "2.5-3": 0,
          ">3": 0,
        },
      });
    });
  });

  describe("normal distribution", () => {
    it("should calculate correct statistics for multiple values", () => {
      const config: BucketConfig = {
        boundaries: [2.0, 2.5, 3.0],
      };

      const result = computeDistribution([1.5, 2.1, 2.5, 2.8, 3.5], config);

      expect(result.mean).toBeCloseTo(2.48, 2);
      expect(result.median).toBe(2.5);
      expect(result.min).toBe(1.5);
      expect(result.max).toBe(3.5);
      expect(result.count).toBe(5);
      expect(result.buckets).toEqual({
        "<2": 1, // 1.5
        "2-2.5": 1, // 2.1
        "2.5-3": 2, // 2.5, 2.8 (2.5 is inclusive of lower bound)
        ">3": 1, // 3.5
      });
    });

    it("should handle even number of values for median", () => {
      const config: BucketConfig = {
        boundaries: [5, 10],
      };

      const result = computeDistribution([2, 4, 6, 8], config);

      expect(result.median).toBe(5); // (4 + 6) / 2
      expect(result.mean).toBe(5); // (2 + 4 + 6 + 8) / 4
    });

    it("should handle odd number of values for median", () => {
      const config: BucketConfig = {
        boundaries: [5, 10],
      };

      const result = computeDistribution([1, 3, 5, 7, 9], config);

      expect(result.median).toBe(5);
      expect(result.mean).toBe(5);
    });
  });

  describe("custom buckets", () => {
    it("should use custom bucket boundaries", () => {
      const config: BucketConfig = {
        boundaries: [7, 21, 90],
        unitSuffix: "d",
      };

      const result = computeDistribution([1, 10, 30, 100, 200], config);

      expect(result.buckets).toEqual({
        "<7d": 1,
        "7-21d": 1,
        "21-90d": 1,
        ">90d": 2,
      });
    });

    it("should support custom label formatting", () => {
      const config: BucketConfig = {
        boundaries: [7, 21, 90],
        formatLabel: (lower, upper) => {
          if (lower === null) return `Less than ${upper} days`;
          if (upper === null) return `More than ${lower} days`;
          return `${lower}-${upper} days`;
        },
      };

      const result = computeDistribution([1, 10, 30, 100], config);

      expect(result.buckets).toEqual({
        "Less than 7 days": 1,
        "7-21 days": 1,
        "21-90 days": 1,
        "More than 90 days": 1,
      });
    });

    it("should handle single boundary", () => {
      const config: BucketConfig = {
        boundaries: [50],
      };

      const result = computeDistribution([10, 60, 70], config);

      expect(result.buckets).toEqual({
        "<50": 1,
        ">50": 2,
      });
    });

    it("should handle values exactly at boundaries", () => {
      const config: BucketConfig = {
        boundaries: [10, 20, 30],
      };

      const result = computeDistribution([5, 10, 20, 30, 35], config);

      expect(result.buckets).toEqual({
        "<10": 1,
        "10-20": 1, // 10 is inclusive of lower bound
        "20-30": 1, // 20 is inclusive
        ">30": 2, // 30 and 35
      });
    });
  });

  describe("ease factor distribution (real-world example)", () => {
    it("should correctly bucket ease factors", () => {
      const config: BucketConfig = {
        boundaries: [2.0, 2.5, 3.0],
      };

      // Simulated ease factors (divided by 1000 from AnkiConnect)
      const easeFactors = [1.3, 1.5, 2.1, 2.3, 2.5, 2.7, 3.0, 3.5, 4.0];

      const result = computeDistribution(easeFactors, config);

      expect(result.buckets).toEqual({
        "<2": 2, // 1.3, 1.5
        "2-2.5": 2, // 2.1, 2.3
        "2.5-3": 2, // 2.5, 2.7
        ">3": 3, // 3.0, 3.5, 4.0
      });
    });
  });

  describe("interval distribution (real-world example)", () => {
    it("should correctly bucket intervals in days", () => {
      const config: BucketConfig = {
        boundaries: [7, 21, 90],
        unitSuffix: "d",
      };

      // Simulated intervals (positive values = review cards in days)
      const intervals = [1, 3, 5, 10, 15, 30, 45, 100, 200];

      const result = computeDistribution(intervals, config);

      expect(result.buckets).toEqual({
        "<7d": 3, // 1, 3, 5
        "7-21d": 2, // 10, 15
        "21-90d": 2, // 30, 45
        ">90d": 2, // 100, 200
      });
    });
  });
});

describe("computeRetention", () => {
  describe("empty array handling", () => {
    it("should return zero retention for empty array", () => {
      const result = computeRetention([]);

      expect(result).toEqual({
        overall: 0,
        by_rating: {
          again: 0,
          hard: 0,
          good: 0,
          easy: 0,
        },
      });
    });
  });

  describe("all button ratings", () => {
    it("should correctly count all button presses", () => {
      const result = computeRetention([1, 2, 3, 4, 3, 3, 2, 1]);

      expect(result).toEqual({
        overall: 0.75, // 6 remembered / 8 total
        by_rating: {
          again: 2,
          hard: 2,
          good: 3,
          easy: 1,
        },
      });
    });

    it("should calculate correct retention rate", () => {
      const result = computeRetention([3, 4, 2, 3, 1, 3]);

      expect(result.overall).toBeCloseTo(0.833, 3); // 5/6
      expect(result.by_rating).toEqual({
        again: 1,
        hard: 1,
        good: 3,
        easy: 1,
      });
    });
  });

  describe("edge cases", () => {
    it("should handle all Again (0% retention)", () => {
      const result = computeRetention([1, 1, 1, 1]);

      expect(result.overall).toBe(0);
      expect(result.by_rating).toEqual({
        again: 4,
        hard: 0,
        good: 0,
        easy: 0,
      });
    });

    it("should handle all Easy (100% retention)", () => {
      const result = computeRetention([4, 4, 4, 4]);

      expect(result.overall).toBe(1);
      expect(result.by_rating).toEqual({
        again: 0,
        hard: 0,
        good: 0,
        easy: 4,
      });
    });

    it("should handle all Hard (100% retention)", () => {
      const result = computeRetention([2, 2, 2]);

      expect(result.overall).toBe(1);
      expect(result.by_rating).toEqual({
        again: 0,
        hard: 3,
        good: 0,
        easy: 0,
      });
    });

    it("should handle all Good (100% retention)", () => {
      const result = computeRetention([3, 3, 3]);

      expect(result.overall).toBe(1);
      expect(result.by_rating).toEqual({
        again: 0,
        hard: 0,
        good: 3,
        easy: 0,
      });
    });

    it("should ignore invalid button values", () => {
      const result = computeRetention([1, 2, 3, 4, 0, 5, 99]);

      expect(result).toEqual({
        overall: 0.75, // 3/4 (only valid buttons counted)
        by_rating: {
          again: 1,
          hard: 1,
          good: 1,
          easy: 1,
        },
      });
    });
  });

  describe("real-world examples", () => {
    it("should calculate typical study session retention", () => {
      // Typical session: mostly Good, some Hard, few Again
      const result = computeRetention([
        3,
        3,
        3,
        3,
        3,
        3,
        3,
        3, // 8 Good
        2,
        2,
        2, // 3 Hard
        1, // 1 Again
        4, // 1 Easy
      ]);

      expect(result.overall).toBeCloseTo(0.923, 3); // 12/13
      expect(result.by_rating).toEqual({
        again: 1,
        hard: 3,
        good: 8,
        easy: 1,
      });
    });

    it("should calculate struggling learner retention", () => {
      // Struggling: more Again and Hard
      const result = computeRetention([
        1,
        1,
        1,
        1,
        1, // 5 Again
        2,
        2,
        2, // 3 Hard
        3,
        3, // 2 Good
      ]);

      expect(result.overall).toBe(0.5); // 5/10
      expect(result.by_rating).toEqual({
        again: 5,
        hard: 3,
        good: 2,
        easy: 0,
      });
    });
  });
});

describe("calculateStreak", () => {
  describe("no reviews", () => {
    it("should return 0 for empty array", () => {
      const result = calculateStreak([]);

      expect(result).toBe(0);
    });

    it("should return 0 if no reviews today", () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];

      const result = calculateStreak([{ date: yesterdayStr, count: 10 }]);

      expect(result).toBe(0);
    });

    it("should return 0 if today has 0 reviews", () => {
      const today = new Date().toISOString().split("T")[0];

      const result = calculateStreak([{ date: today, count: 0 }]);

      expect(result).toBe(0);
    });
  });

  describe("continuous streak", () => {
    it("should count consecutive days from today", () => {
      const dates = [];
      const today = new Date();

      for (let i = 0; i < 5; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push({
          date: date.toISOString().split("T")[0],
          count: 10,
        });
      }

      const result = calculateStreak(dates);

      expect(result).toBe(5);
    });

    it("should handle single day streak", () => {
      const today = new Date().toISOString().split("T")[0];

      const result = calculateStreak([{ date: today, count: 5 }]);

      expect(result).toBe(1);
    });

    it("should handle unsorted input", () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

      const result = calculateStreak([
        { date: yesterday.toISOString().split("T")[0], count: 5 },
        { date: today.toISOString().split("T")[0], count: 10 },
        { date: twoDaysAgo.toISOString().split("T")[0], count: 3 },
      ]);

      expect(result).toBe(3);
    });
  });

  describe("broken streak", () => {
    it("should stop at first gap", () => {
      const today = new Date();
      const dates = [];

      // Today
      dates.push({
        date: today.toISOString().split("T")[0],
        count: 10,
      });

      // Yesterday
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      dates.push({
        date: yesterday.toISOString().split("T")[0],
        count: 5,
      });

      // Gap (2 days ago - no entry)

      // 3 days ago (should not count)
      const threeDaysAgo = new Date(today);
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      dates.push({
        date: threeDaysAgo.toISOString().split("T")[0],
        count: 8,
      });

      const result = calculateStreak(dates);

      expect(result).toBe(2);
    });

    it("should stop at day with 0 reviews", () => {
      const today = new Date();
      const dates = [];

      // Today
      dates.push({
        date: today.toISOString().split("T")[0],
        count: 10,
      });

      // Yesterday with 0 reviews (breaks streak)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      dates.push({
        date: yesterday.toISOString().split("T")[0],
        count: 0,
      });

      // 2 days ago
      const twoDaysAgo = new Date(today);
      twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
      dates.push({
        date: twoDaysAgo.toISOString().split("T")[0],
        count: 5,
      });

      const result = calculateStreak(dates);

      expect(result).toBe(1);
    });
  });

  describe("real-world examples", () => {
    it("should calculate week-long streak", () => {
      const today = new Date();
      const dates = [];

      for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push({
          date: date.toISOString().split("T")[0],
          count: Math.floor(Math.random() * 20) + 1, // Random 1-20 reviews
        });
      }

      const result = calculateStreak(dates);

      expect(result).toBe(7);
    });

    it("should handle partial historical data", () => {
      const today = new Date();
      const dates = [];

      // Only today and yesterday
      dates.push({
        date: today.toISOString().split("T")[0],
        count: 10,
      });

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      dates.push({
        date: yesterday.toISOString().split("T")[0],
        count: 5,
      });

      // No data for 2 days ago (implicit gap)

      const result = calculateStreak(dates);

      expect(result).toBe(2);
    });

    it("should handle long streak with gap in middle", () => {
      const today = new Date();
      const dates = [];

      // Recent 3-day streak
      for (let i = 0; i < 3; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push({
          date: date.toISOString().split("T")[0],
          count: 10,
        });
      }

      // Gap at 3 days ago

      // Older streak (should not count)
      for (let i = 4; i < 10; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        dates.push({
          date: date.toISOString().split("T")[0],
          count: 10,
        });
      }

      const result = calculateStreak(dates);

      expect(result).toBe(3);
    });
  });
});
