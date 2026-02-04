import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { DeckInfo, DeckStats } from "@/mcp/types/anki.types";

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
  total: number;
  message?: string;
  summary?: {
    total_cards: number;
    new_cards: number;
    learning_cards: number;
    review_cards: number;
  };
}

/**
 * List all available Anki decks, optionally with statistics
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#decknames
 * @see https://git.sr.ht/~foosoft/anki-connect#getdeckstats
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
    // Get deck statistics for all decks using the correct action name
    // getDeckStats requires an array of deck names
    const deckStatsResponse = await client.invoke<Record<string, any>>(
      "getDeckStats",
      {
        decks: deckNames,
      },
    );

    // Transform to our DeckInfo structure
    // The response is keyed by deck ID, not name
    const statsArray = Object.values(deckStatsResponse);

    decks = deckNames.map((name) => {
      // Find the stats for this deck by name
      const stats = statsArray.find((s: any) => s.name === name);
      if (stats) {
        return {
          name,
          stats: {
            deck_id: stats.deck_id || 0,
            name,
            new_count: stats.new_count || 0,
            learn_count: stats.learn_count || 0,
            review_count: stats.review_count || 0,
            total_new: stats.new_count || 0,
            total_cards: stats.total_in_deck || 0,
          } as DeckStats,
        };
      }
      return { name };
    });

    // Calculate summary totals
    summary = decks.reduce(
      (acc, deck) => {
        if (deck.stats) {
          acc.total_cards += deck.stats.total_cards;
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
