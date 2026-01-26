import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";
import { computeRetention, calculateStreak } from "@/mcp/utils/stats.utils";
import { ReviewStatsResult, CardReviewTuple } from "./review-stats.types";

/** Milliseconds in one day */
const MS_PER_DAY = 86400000;

/**
 * Tool for getting review history analysis with retention and streak metrics
 */
@Injectable()
export class ReviewStatsTool {
  private readonly logger = new Logger(ReviewStatsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "review_stats",
    description:
      "Get review history analysis including temporal patterns, retention metrics, and study streak information. " +
      "Use this to analyze learning progress over time, identify review patterns, and track consistency. " +
      "Requires a start date and deck name; end date defaults to today.",
    parameters: z
      .object({
        deck: z
          .string()
          .describe(
            "Deck name to filter reviews (REQUIRED - AnkiConnect API requires a deck)",
          ),
        start_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date format: YYYY-MM-DD")
          .refine((date) => !isNaN(Date.parse(date)), {
            message: "Must be a valid date",
          })
          .describe(
            "Start date for analysis (ISO format: YYYY-MM-DD) - REQUIRED",
          ),
        end_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be ISO date format: YYYY-MM-DD")
          .refine((date) => !isNaN(Date.parse(date)), {
            message: "Must be a valid date",
          })
          .optional()
          .describe("End date (defaults to today)"),
      })
      .refine(
        (data) => {
          if (!data.end_date) return true;
          return new Date(data.start_date) <= new Date(data.end_date);
        },
        {
          message: "start_date must be less than or equal to end_date",
          path: ["start_date"],
        },
      ),
  })
  async execute(
    params: {
      deck: string;
      start_date: string;
      end_date?: string;
    },
    context: Context,
  ) {
    try {
      const { deck, start_date } = params;
      const end_date = params.end_date || this.getTodayISO();

      this.logger.log(
        `Getting review statistics from ${start_date} to ${end_date} for deck: ${deck}`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      // Convert dates to timestamps (in milliseconds)
      // Note: Using local timezone to match Anki's behavior for "today"
      const startTimestamp = new Date(start_date).getTime();
      const endTimestamp = new Date(end_date).getTime() + MS_PER_DAY; // Add 1 day to include end date

      // Step 1: Get detailed review data for the specified deck
      this.logger.log(`Fetching detailed review data for deck: ${deck}...`);

      const reviews = await this.ankiClient.invoke<CardReviewTuple[]>(
        "cardReviews",
        {
          startID: startTimestamp,
          deck: deck,
        },
      );

      await context.reportProgress({ progress: 40, total: 100 });

      // Filter reviews to end_date (API only filters by start)
      const filteredReviews = reviews.filter(
        (review) => review[0] <= endTimestamp,
      );

      // Step 2: Calculate daily review counts from filtered reviews
      this.logger.log("Calculating daily review counts from reviews...");
      const reviewsByDayMap = new Map<string, number>();

      for (const review of filteredReviews) {
        const date = new Date(review[0]).toISOString().split("T")[0];
        reviewsByDayMap.set(date, (reviewsByDayMap.get(date) ?? 0) + 1);
      }

      // Convert to array format and sort by date
      const reviewsByDay = Array.from(reviewsByDayMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      await context.reportProgress({ progress: 60, total: 100 });

      // Extract button presses (index 3 in tuple)
      // 1=Again, 2=Hard, 3=Good, 4=Easy
      const buttonPresses = filteredReviews.map((review) => review[3]);

      // Compute retention
      this.logger.log("Computing retention metrics...");
      const retention = computeRetention(buttonPresses);

      await context.reportProgress({ progress: 80, total: 100 });

      // Calculate summary statistics
      this.logger.log("Calculating summary statistics...");
      const totalReviews = reviewsByDay.reduce((sum, r) => sum + r.count, 0);
      const daysStudied = reviewsByDay.filter((r) => r.count > 0).length;
      const averagePerDay =
        reviewsByDay.length > 0 ? totalReviews / reviewsByDay.length : 0;

      // Find max and min days (excluding zero days for min)
      const nonZeroDays = reviewsByDay.filter((r) => r.count > 0);
      const maxDay =
        nonZeroDays.length > 0
          ? nonZeroDays.reduce((max, r) => (r.count > max.count ? r : max))
          : null;
      const minDay =
        nonZeroDays.length > 0
          ? nonZeroDays.reduce((min, r) => (r.count < min.count ? r : min))
          : null;

      // Calculate streak
      const streak = calculateStreak(reviewsByDay);

      await context.reportProgress({ progress: 90, total: 100 });

      const result: ReviewStatsResult = {
        period: {
          start: start_date,
          end: end_date,
        },
        deck: deck,
        reviews_by_day: reviewsByDay,
        summary: {
          total_reviews: totalReviews,
          average_per_day: averagePerDay,
          days_studied: daysStudied,
          max_day: maxDay,
          min_day: minDay,
          streak,
        },
        retention,
      };

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Successfully retrieved review statistics: ${totalReviews} total reviews, ` +
          `${daysStudied} days studied, ${(retention.overall * 100).toFixed(1)}% retention, ` +
          `${streak} day streak`,
      );

      return createSuccessResponse(result);
    } catch (error) {
      this.logger.error(`Failed to get review statistics`, error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and date format is YYYY-MM-DD. Use list_decks to verify deck name if filtering by deck.",
      });
    }
  }

  /**
   * Get today's date in ISO format (YYYY-MM-DD)
   * Uses local timezone to match Anki's behavior for "today"
   */
  private getTodayISO(): string {
    const today = new Date();
    return today.toISOString().split("T")[0];
  }
}
