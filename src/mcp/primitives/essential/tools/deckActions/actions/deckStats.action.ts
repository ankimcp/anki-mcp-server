import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import type { AnkiDeckStatsResponse } from "@/mcp/types/anki.types";
import {
  computeDistribution,
  DistributionMetrics,
} from "@/mcp/utils/stats.utils";

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
 * Result structure for deckStats action
 */
export interface DeckStatsResult {
  /** Whether the operation succeeded */
  success: boolean;

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
}

/**
 * Progress callback type for reporting operation progress
 */
export type ProgressCallback = (progress: number) => Promise<void>;

/**
 * Get comprehensive statistics for a single deck including card counts,
 * ease factor distribution, and interval distribution
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

  // Step 1: Resolve deck name → ID (getDeckStats returns short names for child decks,
  // so we match by ID instead of name to handle "Parent::Child" decks correctly)
  const deckNamesAndIds = await client.invoke<Record<string, number>>(
    "deckNamesAndIds",
    {},
  );
  const deckId = deckNamesAndIds?.[deck];

  if (deckId == null) {
    throw new Error(`Deck "${deck}" not found`);
  }

  // Step 2: Get basic card counts from getDeckStats
  const deckStatsResponse = await client.invoke<
    Record<string, AnkiDeckStatsResponse>
  >("getDeckStats", {
    decks: [deck],
  });

  // Extract stats by deck ID
  const deckStatsData = deckStatsResponse?.[String(deckId)];

  if (!deckStatsData) {
    throw new Error(`Deck "${deck}" not found in statistics response`);
  }

  const total = deckStatsData.total_in_deck || 0;
  const newCount = deckStatsData.new_count || 0;
  const learning = deckStatsData.learn_count || 0;
  const review = deckStatsData.review_count || 0;
  // `total_in_deck` from AnkiConnect includes every card in the deck, whereas
  // new/learn/review come from the scheduler's due tree which excludes
  // suspended (and buried) cards. The remainder lives in `other`.
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

  // Step 3: Get all card IDs for this deck
  // Escape special characters in deck name for Anki search
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
