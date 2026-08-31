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
 * AnkiConnect's `cardsModTime` payload — a lighter existence check than
 * `cardsInfo`, since it skips rendering question/answer/css per card.
 * Missing cards come back as `{}`, same as `cardsInfo`.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#cardsmodtime
 */
export interface AnkiCardModTime {
  cardId?: number;
  mod?: number;
}

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
 * Collect the requested card IDs whose positionally-aligned response entry
 * doesn't carry a numeric `cardId` — AnkiConnect's way of marking a missing
 * card in both `cardsInfo` and `cardsModTime`.
 */
export function findMissingIds(
  cards: number[],
  responses: ReadonlyArray<{ cardId?: number }> | undefined,
): number[] {
  const missingIds: number[] = [];
  cards.forEach((id, index) => {
    const entry = responses?.[index];
    if (!entry || typeof entry.cardId !== "number") {
      missingIds.push(id);
    }
  });
  return missingIds;
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

  const missingIds = findMissingIds(cards, cardsInfo);
  if (missingIds.length > 0) {
    throw new MissingCardIdsError(missingIds, cards.length, noOpNotice);
  }

  return cardsInfo as ExistingAnkiCardInfo[];
}

/**
 * Confirm every card ID exists without paying for `cardsInfo`'s rendered
 * question/answer/css — `cardsModTime` has the same missing-card contract
 * (`{}` per absent ID, positionally aligned) but only returns `cardId`/`mod`.
 *
 * Use this instead of {@link fetchExistingCards} when the caller doesn't need
 * the card's scheduling state, just proof the IDs are real.
 *
 * @param noOpNotice Clause appended to the error explaining that nothing was
 *   changed, phrased for the calling tool (e.g. "No cards were rescheduled.").
 * @throws {MissingCardIdsError} When any provided card ID doesn't exist.
 */
export async function assertCardIdsExist(
  cards: number[],
  client: AnkiConnectClient,
  noOpNotice: string,
): Promise<void> {
  const modTimes = await client.invoke<AnkiCardModTime[]>("cardsModTime", {
    cards,
  });

  const missingIds = findMissingIds(cards, modTimes);
  if (missingIds.length > 0) {
    throw new MissingCardIdsError(missingIds, cards.length, noOpNotice);
  }
}
