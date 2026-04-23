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
 * Error thrown when one or more card IDs don't exist in the collection.
 * The tool wrapper converts this into an MCP error response.
 */
export class InvalidCardIdsError extends Error {
  constructor(
    public readonly invalidIds: number[],
    public readonly totalRequested: number,
  ) {
    super(InvalidCardIdsError.buildMessage(invalidIds, totalRequested));
    this.name = "InvalidCardIdsError";
  }

  private static buildMessage(ids: number[], total: number): string {
    // Cap list shown in the error message so a huge bogus input doesn't
    // produce a massive unreadable error string.
    const MAX_SHOWN = 10;
    const shown = ids.slice(0, MAX_SHOWN).join(", ");
    const suffix =
      ids.length > MAX_SHOWN ? ` (and ${ids.length - MAX_SHOWN} more)` : "";
    return (
      `${ids.length} of ${total} card ID(s) do not exist in the Anki ` +
      `collection: [${shown}]${suffix}. No cards were moved.`
    );
  }
}

/**
 * Move cards to a different deck
 *
 * Moves the specified cards to the target deck.
 * If the deck doesn't exist, it will be created automatically.
 *
 * Validates that all provided card IDs exist before issuing `changeDeck`,
 * because AnkiConnect's `changeDeck` silently returns null whether or not
 * the cards exist, which would otherwise hide bogus-ID bugs from callers.
 *
 * @throws {InvalidCardIdsError} When any provided card ID doesn't exist.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#changedeck
 * @see https://git.sr.ht/~foosoft/anki-connect#cardsinfo
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

  // Validate card IDs exist before mutating. cardsInfo returns an array
  // where missing cards are represented as empty objects `{}` (no cardId).
  const cardsInfo = await client.invoke<Array<{ cardId?: number }>>(
    "cardsInfo",
    { cards },
  );

  const invalidIds: number[] = [];
  cards.forEach((id, index) => {
    const info = cardsInfo?.[index];
    if (!info || typeof info.cardId !== "number") {
      invalidIds.push(id);
    }
  });

  if (invalidIds.length > 0) {
    throw new InvalidCardIdsError(invalidIds, cards.length);
  }

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
