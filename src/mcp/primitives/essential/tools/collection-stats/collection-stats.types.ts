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
  /**
   * Cards not in new/learning/review buckets. Computed as
   * `total - new - learning - review`. Typically suspended or buried cards,
   * since AnkiConnect's getDeckStats only reports the three scheduler-visible
   * buckets while `total_in_deck` includes every card in the deck.
   */
  other: number;
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
    /**
     * Cards not in new/learning/review buckets. Computed as
     * `total - new - learning - review`. Typically suspended or buried cards,
     * since AnkiConnect's getDeckStats only reports the three scheduler-visible
     * buckets while `total_in_deck` includes every card in the deck.
     */
    other: number;
  };

  /** Ease factor distribution (only for cards with ease values) */
  ease: DistributionMetrics;

  /** Interval distribution in days (only for review cards with positive intervals) */
  intervals: DistributionMetrics;

  /** Per-deck breakdown of card counts (one entry per deck returned by deckNames) */
  per_deck: PerDeckStats[];
}
