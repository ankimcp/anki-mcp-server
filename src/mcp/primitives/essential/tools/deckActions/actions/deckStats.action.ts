import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  computeDistribution,
  DistributionMetrics,
} from "@/mcp/utils/stats.utils";

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

  // Step 1: Get basic card counts from getDeckStats
  const deckStatsResponse = await client.invoke<
    Record<string, AnkiDeckStatsResponse>
  >("getDeckStats", {
    decks: [deck],
  });

  // Check if deck exists
  if (!deckStatsResponse || Object.keys(deckStatsResponse).length === 0) {
    throw new Error(`Deck "${deck}" not found`);
  }

  // Extract stats from response (keyed by deck ID)
  const deckStatsArray = Object.values(deckStatsResponse);
  const deckStatsData = deckStatsArray.find((s) => s.name === deck);

  if (!deckStatsData) {
    throw new Error(`Deck "${deck}" not found in statistics response`);
  }

  const counts = {
    total: deckStatsData.total_in_deck || 0,
    new: deckStatsData.new_count || 0,
    learning: deckStatsData.learn_count || 0,
    review: deckStatsData.review_count || 0,
  };

  await onProgress?.(30);

  // Handle empty deck case
  if (counts.total === 0) {
    return {
      deck,
      counts,
      ease: computeDistribution([], { boundaries: easeBuckets }),
      intervals: computeDistribution([], {
        boundaries: intervalBuckets,
        unitSuffix: "d",
      }),
    };
  }

  // Step 2: Get all card IDs for this deck
  // Escape special characters in deck name for Anki search
  const escapedDeckName = deck.replace(/"/g, '\\"');
  const cardIds = await client.invoke<number[]>("findCards", {
    query: `"deck:${escapedDeckName}"`,
  });

  if (!cardIds || cardIds.length === 0) {
    return {
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

  // Step 3: Get ease factors (divide by 1000!)
  const easeFactorsRaw = await client.invoke<number[]>("getEaseFactors", {
    cards: cardIds,
  });

  // Transform: divide by 1000 and filter invalid values
  const easeValues = easeFactorsRaw
    .map((e) => e / 1000) // 4100 → 4.1
    .filter((e) => e > 0); // Filter out invalid values (0 = new cards)

  await onProgress?.(70);

  // Step 4: Get intervals (filter negatives = learning cards)
  const intervalsRaw = await client.invoke<number[]>("getIntervals", {
    cards: cardIds,
  });

  // Transform: filter out negative values (learning cards in seconds)
  const intervalValues = intervalsRaw.filter((i) => i > 0); // Only review cards (positive = days)

  await onProgress?.(90);

  // Step 5: Compute distributions
  const ease = computeDistribution(easeValues, {
    boundaries: easeBuckets,
  });

  const intervals = computeDistribution(intervalValues, {
    boundaries: intervalBuckets,
    unitSuffix: "d",
  });

  return {
    deck,
    counts,
    ease,
    intervals,
  };
}
