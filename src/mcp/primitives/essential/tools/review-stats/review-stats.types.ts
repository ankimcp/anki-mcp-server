import { RetentionMetrics } from "@/mcp/utils/stats.utils";

/**
 * Input parameters for review_stats tool
 */
export interface ReviewStatsParams {
  /** Deck name (omit for entire collection) */
  deck?: string;

  /** Start date for analysis (ISO format: YYYY-MM-DD) - REQUIRED */
  start_date: string;

  /** End date (defaults to today) */
  end_date?: string;
}

/**
 * Parameters for cardReviews AnkiConnect API call
 */
export interface CardReviewsParams {
  /** Start timestamp in milliseconds */
  startID: number;
  /** Optional deck filter */
  deck?: string;
}

/**
 * Card review tuple returned by AnkiConnect cardReviews API
 * Format: [timestamp, cardId, usn, buttonPressed, newInterval, previousInterval, ease, timeTaken, reviewType]
 */
export type CardReviewTuple = [
  timestamp: number,
  cardId: number,
  usn: number,
  buttonPressed: number,
  newInterval: number,
  previousInterval: number,
  ease: number,
  timeTaken: number,
  reviewType: number,
];

/**
 * Result structure for review_stats tool
 */
export interface ReviewStatsResult {
  /** Time period for analysis */
  period: {
    /** Start date (ISO format) */
    start: string;
    /** End date (ISO format) */
    end: string;
  };

  /** Deck name or "All Decks" */
  deck: string;

  /** Daily review counts (collection-wide if no deck specified, deck-specific if filtered) */
  reviews_by_day: Array<{
    /** Date (ISO format: YYYY-MM-DD) */
    date: string;
    /** Number of reviews on this date */
    count: number;
  }>;

  /** Summary statistics */
  summary: {
    /** Total number of reviews in period */
    total_reviews: number;
    /** Average reviews per day */
    average_per_day: number;
    /** Number of days with at least 1 review */
    days_studied: number;
    /** Day with most reviews */
    max_day: { date: string; count: number } | null;
    /** Day with least reviews (excluding zero days) */
    min_day: { date: string; count: number } | null;
    /** Consecutive days studied from today backwards */
    streak: number;
  };

  /** Retention metrics based on button presses */
  retention: RetentionMetrics;
}
