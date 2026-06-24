import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { computeRetention, calculateStreak } from "@/mcp/utils/stats.utils";
import {
  ReviewStatsResult,
  CardReviewTuple,
  CardReviewObject,
} from "./review-stats.types";

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
      "Requires a start date; the deck is optional - omit it to analyze the entire collection (all decks). " +
      "End date defaults to today.",
    parameters: z
      .object({
        deck: z
          .string()
          .optional()
          .describe(
            "Deck name to filter reviews. Matches the exact deck only (subdecks are NOT rolled up). " +
              "Omit to analyze the entire collection (all decks).",
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
    outputSchema: z.object({
      period: z.object({
        start: z.string(),
        end: z.string(),
      }),
      deck: z.string(),
      reviews_by_day: z.array(
        z.object({
          date: z.string(),
          count: z.number(),
        }),
      ),
      summary: z.object({
        total_reviews: z.number(),
        average_per_day: z.number(),
        days_studied: z.number(),
        max_day: z
          .object({
            date: z.string(),
            count: z.number(),
          })
          .nullable(),
        min_day: z
          .object({
            date: z.string(),
            count: z.number(),
          })
          .nullable(),
        streak: z.number(),
      }),
      retention: z.object({
        overall: z.number(),
        by_rating: z.object({
          again: z.number(),
          hard: z.number(),
          good: z.number(),
          easy: z.number(),
        }),
      }),
    }),
    annotations: {
      title: "Review Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: {
    deck?: string;
    start_date: string;
    end_date?: string;
  }) {
    try {
      const { start_date } = params;
      const deck =
        params.deck && params.deck.length > 0 ? params.deck : undefined;
      const deckLabel = deck ?? "All Decks";
      const end_date = params.end_date || this.getTodayISO();

      this.logger.log(
        `Getting review statistics from ${start_date} to ${end_date} for deck: ${deckLabel}`,
      );

      // Convert dates to timestamps (in milliseconds)
      // Note: Using local timezone to match Anki's behavior for "today"
      const startTimestamp = new Date(start_date).getTime();
      const endTimestamp = new Date(end_date).getTime() + MS_PER_DAY; // Add 1 day to include end date

      // Step 1: Get detailed review data.
      // A specific deck uses AnkiConnect's `cardReviews` (exact deck, no subdeck
      // rollup). When no deck is given we fall back to a collection-wide path,
      // because `cardReviews` requires an exact deck name and can't answer
      // "all decks".
      this.logger.log(
        `Fetching detailed review data for deck: ${deckLabel}...`,
      );

      const reviews = deck
        ? await this.ankiClient.invoke<CardReviewTuple[]>("cardReviews", {
            startID: startTimestamp,
            deck,
          })
        : await this.fetchCollectionReviews(startTimestamp);

      // Filter reviews to end_date (lower bound already applied above)
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

      // Extract button presses (index 3 in tuple)
      // 1=Again, 2=Hard, 3=Good, 4=Easy
      const buttonPresses = filteredReviews.map((review) => review[3]);

      // Compute retention
      this.logger.log("Computing retention metrics...");
      const retention = computeRetention(buttonPresses);

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

      const result: ReviewStatsResult = {
        period: {
          start: start_date,
          end: end_date,
        },
        deck: deckLabel,
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

      this.logger.log(
        `Successfully retrieved review statistics: ${totalReviews} total reviews, ` +
          `${daysStudied} days studied, ${(retention.overall * 100).toFixed(1)}% retention, ` +
          `${streak} day streak`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to get review statistics`, error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and date format is YYYY-MM-DD. Use listDecks to verify deck name if filtering by deck.",
      });
    }
  }

  /**
   * Fetch reviews across the entire collection (all decks).
   *
   * AnkiConnect's `cardReviews` action requires an exact deck name and does not
   * roll up subdecks, so it can't answer the "all decks" case. Instead we list
   * every card (`findCards deck:*`) and pull their review logs in one batch
   * (`getReviewsOfCards`), then normalize each entry to the same
   * `CardReviewTuple` layout the per-deck path produces so the downstream
   * aggregation is identical. Reviews older than `startTimestamp` are dropped
   * here to mirror cardReviews' `startID` lower-bound filtering.
   */
  private async fetchCollectionReviews(
    startTimestamp: number,
  ): Promise<CardReviewTuple[]> {
    const cardIds = await this.ankiClient.invoke<number[]>("findCards", {
      query: "deck:*",
    });

    if (cardIds.length === 0) {
      return [];
    }

    const reviewsByCard = await this.ankiClient.invoke<
      Record<string, CardReviewObject[]>
    >("getReviewsOfCards", { cards: cardIds });

    const tuples: CardReviewTuple[] = [];
    for (const [cardId, cardReviews] of Object.entries(reviewsByCard)) {
      const cid = Number(cardId);
      for (const r of cardReviews) {
        if (r.id < startTimestamp) {
          continue;
        }
        // Map getReviewsOfCards object -> cardReviews tuple layout.
        // tuple[3] is the button pressed (r.ease); tuple[6] is the ease factor
        // (r.factor).
        tuples.push([
          r.id,
          cid,
          r.usn,
          r.ease,
          r.ivl,
          r.lastIvl,
          r.factor,
          r.time,
          r.type,
        ]);
      }
    }

    return tuples;
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
