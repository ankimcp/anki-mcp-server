import { DistributionMetrics } from "@/mcp/utils/stats.utils";

/**
 * Response structure from AnkiConnect getDeckStats action
 * The response is a record keyed by deck ID (as string)
 */
export interface AnkiDeckStatsResponse {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

/**
 * Input parameters for deck_stats tool
 */
export interface DeckStatsParams {
  /** Deck name to get statistics for */
  deck: string;

  /** Bucket boundaries for ease distribution (default: [2.0, 2.5, 3.0]) */
  ease_buckets?: number[];

  /** Bucket boundaries for interval distribution in days (default: [7, 21, 90]) */
  interval_buckets?: number[];
}

/**
 * Result structure for deck_stats tool
 */
export interface DeckStatsResult {
  /** Deck name */
  deck: string;

  /** Card counts by status */
  counts: {
    /** Total cards in deck */
    total: number;
    /** New cards (never studied) */
    new: number;
    /** Learning/relearning cards */
    learning: number;
    /** Review cards (mature) */
    review: number;
  };

  /** Ease factor distribution (only for cards with ease values) */
  ease: DistributionMetrics;

  /** Interval distribution in days (only for review cards with positive intervals) */
  intervals: DistributionMetrics;
}
