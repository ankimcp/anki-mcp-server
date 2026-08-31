import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * The subset of AnkiConnect's `cardsInfo` payload the scheduling tools care
 * about. Every field is optional because AnkiConnect represents a card it
 * couldn't find as an empty object `{}` rather than omitting the slot.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#cardsinfo
 */
export interface AnkiCardInfo {
  cardId?: number;
  type?: number;
  queue?: number;
  interval?: number;
  due?: number;
  reps?: number;
  lapses?: number;
  factor?: number;
  deckName?: string;
}

/**
 * A `cardsInfo` entry that has been confirmed to exist.
 */
export type ExistingAnkiCardInfo = AnkiCardInfo & { cardId: number };

/**
 * Error thrown when one or more requested card IDs don't exist in the
 * collection. Tool wrappers convert this into an MCP error response.
 */
export class MissingCardIdsError extends Error {
  constructor(
    public readonly missingIds: number[],
    public readonly totalRequested: number,
    /** Trailing clause stating that nothing changed, e.g. "No cards were reset." */
    noOpNotice: string,
  ) {
    super(
      MissingCardIdsError.buildMessage(missingIds, totalRequested, noOpNotice),
    );
    this.name = "MissingCardIdsError";
  }

  private static buildMessage(
    ids: number[],
    total: number,
    noOpNotice: string,
  ): string {
    // Cap the list shown so a huge bogus input doesn't produce a massive
    // unreadable error string.
    const MAX_SHOWN = 10;
    const shown = ids.slice(0, MAX_SHOWN).join(", ");
    const suffix =
      ids.length > MAX_SHOWN ? ` (and ${ids.length - MAX_SHOWN} more)` : "";
    return (
      `${ids.length} of ${total} card ID(s) do not exist in the Anki ` +
      `collection: [${shown}]${suffix}. ${noOpNotice}`
    );
  }
}

/**
 * Look up every card ID and fail unless all of them exist.
 *
 * The scheduling actions (`forgetCards`, `setDueDate`) report success whether
 * or not the IDs they were given are real — `forgetCards` returns `null` and
 * `setDueDate` returns `true` even for an empty or entirely bogus list. Without
 * this pre-check a typo'd ID would look like a successful reset, which is the
 * worst possible failure mode for a tool whose whole job is to change
 * scheduling state.
 *
 * @param noOpNotice Clause appended to the error explaining that nothing was
 *   changed, phrased for the calling tool (e.g. "No cards were reset.").
 * @throws {MissingCardIdsError} When any provided card ID doesn't exist.
 */
export async function fetchExistingCards(
  cards: number[],
  client: AnkiConnectClient,
  noOpNotice: string,
): Promise<ExistingAnkiCardInfo[]> {
  const cardsInfo = await client.invoke<AnkiCardInfo[]>("cardsInfo", { cards });

  const missingIds: number[] = [];
  cards.forEach((id, index) => {
    const info = cardsInfo?.[index];
    if (!info || typeof info.cardId !== "number") {
      missingIds.push(id);
    }
  });

  if (missingIds.length > 0) {
    throw new MissingCardIdsError(missingIds, cards.length, noOpNotice);
  }

  return cardsInfo as ExistingAnkiCardInfo[];
}
