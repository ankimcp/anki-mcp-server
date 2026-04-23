import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import type { AnkiDeckStatsResponse } from "@/mcp/types/anki.types";
import {
  computeDistribution,
  DistributionMetrics,
} from "@/mcp/utils/stats.utils";
import { isDescendantOf } from "@/mcp/utils/deck-hierarchy.utils";

/**
 * Parameters for deckStats action
 */
export interface DeckStatsParams {
  /** Deck name to get statistics for */
  deck: string;

  /** Bucket boundaries for ease distribution (default: [2.0, 2.5, 3.0]) */
  easeBuckets?: number[];

  /** Bucket boundaries for interval distribution in days (default: [7, 21, 90]) */
  intervalBuckets?: number[];
}

/**
 * Result structure for deckStats action.
 *
 * All `counts` fields roll up descendants: a stat for `"German"` covers
 * `"German"` + `"German::Verbs"` + `"German::Verbs::Irregular"` etc., matching
 * how the Anki UI displays parent decks.
 */
export interface DeckStatsResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Deck name */
  deck: string;

  /**
   * Card counts by status. All values are rolled up over the deck and all of
   * its descendants (matches Anki UI convention for parent decks).
   * Invariant: `total === new + learning + review + other`.
   */
  counts: {
    /**
     * Total cards in this deck AND all of its descendants
     * (e.g. stats for `"German"` include cards in `"German::Verbs"`).
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
     * rolled up over descendants. Computed as
     * `total - new - learning - review`.
     */
    other: number;
  };

  /** Ease factor distribution (only for cards with ease values) */
  ease: DistributionMetrics;

  /** Interval distribution in days (only for review cards with positive intervals) */
  intervals: DistributionMetrics;
}

/**
 * Progress callback type for reporting operation progress
 */
export type ProgressCallback = (progress: number) => Promise<void>;

/**
 * Get comprehensive statistics for a single deck including card counts,
 * ease factor distribution, and interval distribution.
 *
 * Counts are rolled up over descendant decks (e.g. `"German"` includes
 * cards from `"German::Verbs"`). This matches how AnkiConnect reports
 * scheduler buckets for parent decks and how the Anki UI displays them.
 * Without this rollup, `total_in_deck` (direct cards only) would be
 * inconsistent with `new_count` / `learn_count` / `review_count`
 * (descendants included), producing nonsense like `new > total`.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#getdeckstats
 * @see https://git.sr.ht/~foosoft/anki-connect#findcards
 * @see https://git.sr.ht/~foosoft/anki-connect#geteasefactors
 * @see https://git.sr.ht/~foosoft/anki-connect#getintervals
 */
export async function deckStats(
  params: DeckStatsParams,
  client: AnkiConnectClient,
  onProgress?: ProgressCallback,
): Promise<DeckStatsResult> {
  const {
    deck,
    easeBuckets = [2.0, 2.5, 3.0],
    intervalBuckets = [7, 21, 90],
  } = params;

  // Step 1: Resolve deck name → ID and enumerate descendants. We need the
  // descendants because AnkiConnect's `getDeckStats.total_in_deck` only
  // counts cards stored directly in that deck's table — children are
  // excluded. We'll sum `total_in_deck` across the subtree to match the
  // scheduler buckets, which ARE already rolled up for parent decks.
  const deckNamesAndIds = await client.invoke<Record<string, number>>(
    "deckNamesAndIds",
    {},
  );
  const deckId = deckNamesAndIds?.[deck];

  if (deckId == null) {
    throw new Error(`Deck "${deck}" not found`);
  }

  // Names to request stats for: the deck itself + every descendant
  // (e.g. for "German" we also want "German::Verbs", "German::Verbs::Irr").
  const subtreeDeckNames = Object.keys(deckNamesAndIds).filter(
    (name) => name === deck || isDescendantOf(name, deck),
  );

  // Step 2: Get basic card counts from getDeckStats (for the whole subtree)
  const deckStatsResponse = await client.invoke<
    Record<string, AnkiDeckStatsResponse>
  >("getDeckStats", {
    decks: subtreeDeckNames,
  });

  const rootDeckStats = deckStatsResponse?.[String(deckId)];

  if (!rootDeckStats) {
    throw new Error(`Deck "${deck}" not found in statistics response`);
  }

  // Bucket counts for the requested deck are already rolled up by the
  // scheduler, so we pull them straight from the root's response.
  const newCount = rootDeckStats.new_count || 0;
  const learning = rootDeckStats.learn_count || 0;
  const review = rootDeckStats.review_count || 0;

  // Roll up `total_in_deck` across the subtree (root + descendants) so it's
  // consistent with the scheduler buckets. Without this, a parent with
  // cards only in children would report `total=0, new>0`.
  let total = 0;
  for (const descendantName of subtreeDeckNames) {
    const descId = deckNamesAndIds[descendantName];
    const descStats =
      descId != null ? deckStatsResponse?.[String(descId)] : undefined;
    total += descStats?.total_in_deck ?? 0;
  }

  // Anything not in the three scheduler buckets (typically suspended or
  // buried cards) lands in `other`. Clamp to zero in the pathological case
  // where AnkiConnect's counts disagree with its own card listing.
  const other = Math.max(0, total - newCount - learning - review);

  const counts = {
    total,
    new: newCount,
    learning,
    review,
    other,
  };

  await onProgress?.(30);

  // Handle empty deck case
  if (counts.total === 0) {
    return {
      success: true,
      deck,
      counts,
      ease: computeDistribution([], { boundaries: easeBuckets }),
      intervals: computeDistribution([], {
        boundaries: intervalBuckets,
        unitSuffix: "d",
      }),
    };
  }

  // Step 3: Get all card IDs for this deck (Anki's `deck:` query includes
  // subdecks by default, so this already covers the whole subtree).
  const escapedDeckName = deck.replace(/"/g, '\\"');
  const cardIds = await client.invoke<number[]>("findCards", {
    query: `"deck:${escapedDeckName}"`,
  });

  if (!cardIds || cardIds.length === 0) {
    return {
      success: true,
      deck,
      counts,
      ease: computeDistribution([], { boundaries: easeBuckets }),
      intervals: computeDistribution([], {
        boundaries: intervalBuckets,
        unitSuffix: "d",
      }),
    };
  }

  await onProgress?.(50);

  // Step 4: Get ease factors (divide by 1000!)
  const easeFactorsRaw = await client.invoke<number[]>("getEaseFactors", {
    cards: cardIds,
  });

  // Transform: divide by 1000 and filter invalid values
  const easeValues = easeFactorsRaw
    .map((e) => e / 1000) // 4100 → 4.1
    .filter((e) => e > 0); // Filter out invalid values (0 = new cards)

  await onProgress?.(70);

  // Step 5: Get intervals (filter negatives = learning cards)
  const intervalsRaw = await client.invoke<number[]>("getIntervals", {
    cards: cardIds,
  });

  // Transform: filter out negative values (learning cards in seconds)
  const intervalValues = intervalsRaw.filter((i) => i > 0); // Only review cards (positive = days)

  await onProgress?.(90);

  // Step 6: Compute distributions
  const ease = computeDistribution(easeValues, {
    boundaries: easeBuckets,
  });

  const intervals = computeDistribution(intervalValues, {
    boundaries: intervalBuckets,
    unitSuffix: "d",
  });

  return {
    success: true,
    deck,
    counts,
    ease,
    intervals,
  };
}
