import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import type { AnkiDeckStatsResponse } from "@/mcp/types/anki.types";
import {
  computeDistribution,
  DistributionMetrics,
} from "@/mcp/utils/stats.utils";
import { isDescendantOf } from "@/mcp/utils/deck-hierarchy.utils";
import {
  deckScopeQuery,
  emptyCardStateCounts,
  fetchCardStateCounts,
  type CardStateCounts,
  type DueTreeCounts,
} from "@/mcp/utils/card-states.utils";

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
 * Two different views of the same deck, deliberately kept apart:
 *
 * - `counts` — today's **study queue**, straight from AnkiConnect's
 *   `getDeckStats` (the scheduler due tree). Due-today only and capped by daily
 *   limits. These are the numbers Anki's deck browser shows.
 * - `states` — true **card-state** counts from Anki searches. No due-date
 *   filter, no daily limits.
 *
 * Both views roll up descendants: stats for `"German"` cover `"German"` +
 * `"German::Verbs"` + `"German::Verbs::Irregular"` etc.
 */
export interface DeckStatsResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Deck name */
  deck: string;

  /**
   * Today's study queue for this deck and all of its descendants, as shown in
   * Anki's deck browser — NOT card totals. See {@link DueTreeCounts} for the
   * full semantics of each field.
   *
   * Use {@link DeckStatsResult.states} for "how many cards are in state X".
   */
  counts: DueTreeCounts;

  /**
   * True card-state counts for this deck and its subdecks, from Anki searches.
   * Unaffected by due dates and daily limits. The five values are mutually
   * exclusive and together cover every card matched by `deck:<name>`.
   */
  states: CardStateCounts;

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
 * Get comprehensive statistics for a single deck: today's study queue
 * (`counts`), true card-state counts (`states`), and ease/interval
 * distributions.
 *
 * `counts` mirrors Anki's deck browser — due-today numbers capped by daily
 * limits — while `states` answers "how many cards are in state X" via searches.
 * Keeping both is deliberate: neither can be derived from the other.
 *
 * Both are rolled up over descendant decks (e.g. `"German"` includes cards from
 * `"German::Verbs"`). For `counts` this matches how AnkiConnect reports
 * scheduler buckets for parent decks; without rolling up `total_in_deck`
 * (direct cards only) it would be inconsistent with `new_count` /
 * `learn_count` / `review_count` (descendants included), producing nonsense
 * like `new > total`. For `states` the rollup is free — Anki's `deck:` search
 * includes subdecks by default.
 *
 * @see https://docs.ankiweb.net/searching.html#card-state
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

  // `other` is a residual, not a card state: the three buckets above only
  // count cards DUE TODAY and are capped by the deck's daily limits, while
  // `total` counts every card. So `other` is dominated by review cards not due
  // today and new cards beyond the daily new limit; suspended and buried cards
  // land here too. Clamp to zero in the pathological case where AnkiConnect's
  // counts disagree with its own card listing.
  const other = Math.max(0, total - newCount - learning - review);

  const counts = {
    total,
    new: newCount,
    learning,
    review,
    other,
  };

  await onProgress?.(30);

  // NOTE: deliberately no `counts.total === 0` short-circuit. `total` is the
  // storage-deck row count, the very number this tool cannot trust — a deck
  // whose cards are currently borrowed by a filtered deck can report
  // `total_in_deck: 0` while `deck:X` still matches every one of its cards.
  // The `findCards` result below is the single emptiness gate, and it is
  // derived from the same search the state counts use.

  // Step 3: Get all card IDs for this deck. Anki's `deck:` term matches the
  // deck AND its descendants (and cards pulled into a filtered deck from the
  // subtree), so this single query already covers the whole subtree.
  const deckScope = deckScopeQuery(deck);
  const cardIds = await client.invoke<number[]>("findCards", {
    query: deckScope,
  });

  // Unlike fetchCardStateCounts (which throws on ANY non-array), null/undefined
  // is allowed through here to preserve the long-standing empty-deck path below.
  if (cardIds != null && !Array.isArray(cardIds)) {
    throw new Error("Invalid findCards response: expected array");
  }

  if (!cardIds || cardIds.length === 0) {
    return {
      success: true,
      deck,
      counts,
      states: emptyCardStateCounts(),
      ease: computeDistribution([], { boundaries: easeBuckets }),
      intervals: computeDistribution([], {
        boundaries: intervalBuckets,
        unitSuffix: "d",
      }),
    };
  }

  await onProgress?.(40);

  // Step 4: True card-state counts (5 `findCards` queries). These are what
  // `counts` cannot give us: totals per state, ignoring due dates and daily
  // limits.
  const states = await fetchCardStateCounts(client, deckScope);

  await onProgress?.(55);

  // Step 5: Get ease factors (divide by 1000!)
  const easeFactorsRaw = await client.invoke<number[]>("getEaseFactors", {
    cards: cardIds,
  });

  if (!Array.isArray(easeFactorsRaw)) {
    throw new Error("Invalid getEaseFactors response: expected array");
  }

  // Transform: divide by 1000 and filter invalid values
  const easeValues = easeFactorsRaw
    .map((e) => e / 1000) // 4100 → 4.1
    .filter((e) => e > 0); // Filter out invalid values (0 = new cards)

  await onProgress?.(75);

  // Step 6: Get intervals (filter negatives = learning cards)
  const intervalsRaw = await client.invoke<number[]>("getIntervals", {
    cards: cardIds,
  });

  if (!Array.isArray(intervalsRaw)) {
    throw new Error("Invalid getIntervals response: expected array");
  }

  // Transform: filter out negative values (learning cards in seconds)
  const intervalValues = intervalsRaw.filter((i) => i > 0); // Only review cards (positive = days)

  await onProgress?.(90);

  // Step 7: Compute distributions
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
    states,
    ease,
    intervals,
  };
}
