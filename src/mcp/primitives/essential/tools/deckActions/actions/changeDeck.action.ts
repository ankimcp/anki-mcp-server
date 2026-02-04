import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for changeDeck action
 */
export interface ChangeDeckParams {
  /** Array of card IDs to move */
  cards: number[];

  /** Target deck name (will be created if it doesn't exist) */
  deck: string;
}

/**
 * Result of changeDeck action
 */
export interface ChangeDeckResult {
  success: boolean;
  message: string;
  cardsAffected: number;
  targetDeck: string;
}

/**
 * Move cards to a different deck
 *
 * Moves the specified cards to the target deck.
 * If the deck doesn't exist, it will be created automatically.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#changedeck
 */
export async function changeDeck(
  params: ChangeDeckParams,
  client: AnkiConnectClient,
): Promise<ChangeDeckResult> {
  const { cards, deck } = params;

  // Validate cards array
  if (!cards || cards.length === 0) {
    throw new Error("cards array cannot be empty");
  }

  // Validate deck name
  if (!deck || deck.trim() === "") {
    throw new Error("deck name cannot be empty");
  }

  const trimmedDeck = deck.trim();

  // Call AnkiConnect - changeDeck returns null on success
  await client.invoke<null>("changeDeck", {
    cards,
    deck: trimmedDeck,
  });

  return {
    success: true,
    message: `Successfully moved ${cards.length} card(s) to deck "${trimmedDeck}"`,
    cardsAffected: cards.length,
    targetDeck: trimmedDeck,
  };
}
