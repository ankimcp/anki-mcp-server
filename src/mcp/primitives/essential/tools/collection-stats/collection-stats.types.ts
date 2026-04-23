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
 * Per-deck breakdown structure.
 *
 * All count fields are rolled up over the deck and its descendants so the
 * breakdown matches Anki's deck browser: a row for `"German"` includes
 * cards from `"German::Verbs"`. Invariant: `total === new + learning + review + other`.
 */
export interface PerDeckStats {
  /** Deck name */
  deck: string;
  /**
   * Total cards in this deck AND all of its descendants
   * (e.g. row for `"German"` includes cards in `"German::Verbs"`).
   */
  total: number;
  /** New cards (never studied), rolled up over descendants */
  new: number;
  /** Learning/relearning cards, rolled up over descendants */
  learning: number;
  /** Review cards (mature), rolled up over descendants */
  review: number;
  /**
   * Cards not in new/learning/review (typically suspended or buried),
   * rolled up over descendants. Computed as `total - new - learning - review`.
   */
  other: number;
}

/**
 * Result structure for collection_stats tool.
 *
 * `counts` aggregates ROOT decks only (names without `::`) so children
 * aren't double-counted — each root's per-deck entry is already rolled up
 * over its whole subtree.
 */
export interface CollectionStatsResult {
  /** Total number of decks in collection (includes child decks) */
  total_decks: number;

  /**
   * Aggregated card counts across the collection. Summed over ROOT decks
   * only (names without `::`) so a parent's rollup is not added on top of
   * its children. Invariant: `total === new + learning + review + other`.
   */
  counts: {
    /** Total cards in collection (sum of root decks' rolled-up totals) */
    total: number;
    /** New cards (never studied), summed over root decks' rolled-up counts */
    new: number;
    /** Learning/relearning cards, summed over root decks' rolled-up counts */
    learning: number;
    /** Review cards (mature), summed over root decks' rolled-up counts */
    review: number;
    /**
     * Cards not in new/learning/review (typically suspended or buried),
     * summed over root decks' rolled-up counts.
     * Computed as `total - new - learning - review`.
     */
    other: number;
  };

  /** Ease factor distribution (only for cards with ease values) */
  ease: DistributionMetrics;

  /** Interval distribution in days (only for review cards with positive intervals) */
  intervals: DistributionMetrics;

  /**
   * Per-deck breakdown of card counts. One entry per deck returned by
   * `deckNames` (includes children). Each entry's counts are rolled up over
   * that deck's descendants; invariant per row:
   * `total === new + learning + review + other`.
   */
  per_deck: PerDeckStats[];
}
