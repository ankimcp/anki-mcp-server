import { DistributionMetrics } from "@/mcp/utils/stats.utils";

/**
 * Input parameters for collection_stats tool
 */
export interface CollectionStatsParams {
  /** Bucket boundaries for ease distribution (default: [2.0, 2.5, 3.0]) */
  ease_buckets?: number[];

  /** Bucket boundaries for interval distribution in days (default: [7, 21, 90]) */
  interval_buckets?: number[];
}

/**
 * Response structure from AnkiConnect getDeckStats action
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
 * Per-deck breakdown structure
 */
export interface PerDeckStats {
  /** Deck name */
  deck: string;
  /** Total cards in deck */
  total: number;
  /** New cards (never studied) */
  new: number;
  /** Learning/relearning cards */
  learning: number;
  /** Review cards (mature) */
  review: number;
}

/**
 * Result structure for collection_stats tool
 */
export interface CollectionStatsResult {
  /** Total number of decks in collection */
  total_decks: number;

  /** Aggregated card counts across all decks */
  counts: {
    /** Total cards in collection */
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

  /** Per-deck breakdown of card counts */
  per_deck: PerDeckStats[];
}
