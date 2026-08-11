import type {
  CardStateCounts,
  DueTreeCounts,
} from "@/mcp/utils/card-states.utils";
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
 * Per-deck breakdown structure — today's study queue, NOT card totals. See
 * {@link DueTreeCounts} for the full semantics of each count field.
 *
 * All fields are rolled up over the deck and its descendants, so a row for
 * `"German"` includes cards from `"German::Verbs"`.
 *
 * True per-state counts are only reported collection-wide (see
 * {@link CollectionStatsResult.states}); per-deck state counts would cost five
 * extra queries per deck and are intentionally not included. Call the
 * `deckStats` tool for a single deck's `states`.
 */
export interface PerDeckStats extends DueTreeCounts {
  /** Deck name */
  deck: string;
}

/**
 * Result structure for collection_stats tool.
 *
 * Two different views, deliberately kept apart:
 *
 * - `counts` / `per_deck` — today's **study queue** from the scheduler's due
 *   tree: due-today only, capped by daily limits. Anki's deck browser numbers.
 * - `states` — true **card-state** counts across the whole collection, from
 *   Anki searches. No due-date filter, no daily limits.
 *
 * `counts` aggregates ROOT decks only (names without `::`) so children
 * aren't double-counted — each root's per-deck entry is already rolled up
 * over its whole subtree.
 */
export interface CollectionStatsResult {
  /** Total number of decks in collection (includes child decks) */
  total_decks: number;

  /**
   * Today's study queue across the collection — NOT card totals. See
   * {@link DueTreeCounts} for the full semantics of each field.
   *
   * Summed over ROOT decks only (names without `::`) so a parent's rollup is
   * not added on top of its children.
   *
   * Use {@link CollectionStatsResult.states} for "how many cards are in state X".
   */
  counts: DueTreeCounts;

  /**
   * True card-state counts across the whole collection, from Anki searches.
   * Unaffected by due dates and daily limits. The five values are mutually
   * exclusive and together cover every card in the collection.
   */
  states: CardStateCounts;

  /** Ease factor distribution (only for cards with ease values) */
  ease: DistributionMetrics;

  /** Interval distribution in days (only for review cards with positive intervals) */
  intervals: DistributionMetrics;

  /**
   * Per-deck breakdown of today's study queue (same semantics as `counts`).
   * One entry per deck returned by `deckNames` (includes children). Each
   * entry's counts are rolled up over that deck's descendants; per row,
   * normally `total === new + learning + review + other`, with the same
   * clamping caveat as {@link CollectionStatsResult.counts}.
   */
  per_deck: PerDeckStats[];
}
