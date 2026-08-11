import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { DeckInfo, DeckStats } from "@/mcp/types/anki.types";
import { getRootDeckNames } from "@/mcp/utils/deck-hierarchy.utils";

/**
 * Parameters for listDecks action
 */
export interface ListDecksParams {
  /** Include card count statistics for each deck */
  includeStats?: boolean;
}

/**
 * Result of listDecks action
 */
export interface ListDecksResult {
  success: boolean;
  decks: DeckInfo[];
  /** Number of decks returned (child decks counted separately). */
  total: number;
  message?: string;
  /**
   * Collection-wide totals. The two field families are summed over different
   * deck sets on purpose, because AnkiConnect reports them differently:
   *
   * - `total_cards` sums `total_in_deck`, which counts a deck's OWN cards, so
   *   summing every deck yields the correct collection total.
   * - `new_cards` / `learning_cards` / `review_cards` sum the scheduler's
   *   due-today buckets, which are ALREADY rolled up over subdecks. Summing
   *   every deck would count a parent's cards again for each child, so these
   *   are summed over ROOT decks only — the same convention `collection_stats`
   *   uses.
   */
  summary?: {
    total_cards: number;
    new_cards: number;
    learning_cards: number;
    review_cards: number;
  };
}

/**
 * List all available Anki decks, optionally with statistics.
 *
 * The per-deck stats come straight from AnkiConnect's `getDeckStats`, i.e. the
 * scheduler's due tree: **cards due today, capped by the deck's daily
 * new/review limits**, suspended/buried excluded, rolled up over subdecks —
 * the same numbers Anki's deck browser shows. They are not card totals. Use the
 * `deckStats` tool (its `states` block) for true per-state card counts.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#decknames
 * @see https://git.sr.ht/~foosoft/anki-connect#getdeckstats
 * @see https://git.sr.ht/~foosoft/anki-connect#decknamesandids
 */
export async function listDecks(
  params: ListDecksParams,
  client: AnkiConnectClient,
): Promise<ListDecksResult> {
  const { includeStats = false } = params;

  // Get list of deck names
  const deckNames = await client.invoke<string[]>("deckNames");

  if (!deckNames || deckNames.length === 0) {
    return {
      success: true,
      message: "No decks found in Anki",
      decks: [],
      total: 0,
    };
  }

  let decks: DeckInfo[];
  let summary: ListDecksResult["summary"];

  if (includeStats) {
    // Step 1: Resolve deck names → IDs (getDeckStats returns short names for child decks,
    // so we match by ID instead of name to handle "Parent::Child" decks correctly)
    const deckNamesAndIds = await client.invoke<Record<string, number>>(
      "deckNamesAndIds",
      {},
    );

    // Step 2: Get deck statistics for all decks
    const deckStatsResponse = await client.invoke<
      Record<string, Record<string, unknown>>
    >("getDeckStats", {
      decks: deckNames,
    });

    // Step 3: Transform to our DeckInfo structure
    // Match stats by deck ID to handle child decks whose getDeckStats name
    // is the short leaf name rather than the full path
    decks = deckNames.map((name) => {
      const deckId = deckNamesAndIds?.[name];
      const stats =
        deckId != null ? deckStatsResponse?.[String(deckId)] : undefined;

      if (stats) {
        return {
          name,
          stats: {
            deck_id: (stats.deck_id as number) || 0,
            name,
            new_count: (stats.new_count as number) || 0,
            learn_count: (stats.learn_count as number) || 0,
            review_count: (stats.review_count as number) || 0,
            total_new: (stats.new_count as number) || 0,
            total_cards: (stats.total_in_deck as number) || 0,
          } as DeckStats,
        };
      }
      return { name };
    });

    // Calculate summary totals.
    //
    // `total_cards` sums EVERY deck: `total_in_deck` counts a deck's own cards
    // only, so the sum is the true collection total.
    //
    // The three scheduler buckets sum ROOT decks only. AnkiConnect already
    // rolls those up over subdecks, so adding a parent and its children
    // together counts the children's cards twice (a "German" + "German::Verbs"
    // pair would report double the due cards). Same convention as
    // `collection_stats`.
    const rootDeckNames = new Set(getRootDeckNames(deckNames));

    summary = decks.reduce(
      (acc, deck) => {
        if (!deck.stats) {
          return acc;
        }
        acc.total_cards += deck.stats.total_cards;
        if (rootDeckNames.has(deck.name)) {
          acc.new_cards += deck.stats.new_count;
          acc.learning_cards += deck.stats.learn_count;
          acc.review_cards += deck.stats.review_count;
        }
        return acc;
      },
      { total_cards: 0, new_cards: 0, learning_cards: 0, review_cards: 0 },
    );
  } else {
    // Just return deck names without stats
    decks = deckNames.map((name) => ({ name }));
  }

  const result: ListDecksResult = {
    success: true,
    decks,
    total: decks.length,
  };

  if (summary) {
    result.summary = summary;
  }

  return result;
}
