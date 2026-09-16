import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { MissingCardIdsError } from "@/mcp/utils/card-validation.utils";
import {
  cardIdsSchema,
  cardSuspensionStatusSchema,
  fetchSuspensionStatuses,
  findMissingCardIds,
} from "@/mcp/utils/card-suspension.utils";

/**
 * Input schema, exported so tests can assert cap/type constraints via
 * `safeParse` without going through the mcp-nest handler.
 */
export const suspendCardsInputSchema = z.object({
  cards: cardIdsSchema,
});

/**
 * Tool for suspending cards so they're skipped during review.
 */
@McpController()
export class SuspendCardsTool {
  private readonly logger = new Logger(SuspendCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "suspend",
    description:
      "Suspend cards so they're skipped during review until unsuspended. Card IDs (not note IDs) — " +
      "use get_cards, get_due_cards, or notesInfo to obtain them. Card IDs are checked for existence " +
      "before anything is changed — AnkiConnect's own suspend action doesn't complain about bogus " +
      "IDs, so without this check a typo would silently look like success. Suspending a card that's " +
      "already suspended is a safe no-op, so re-running with the same IDs is safe.",
    parameters: suspendCardsInputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      cardsRequested: z.number(),
      cardsChanged: z
        .number()
        .describe(
          "Cards that were NOT suspended before this call and are suspended now",
        ),
      alreadySuspended: z
        .array(z.number())
        .describe("Card IDs that were already suspended before this call"),
      cards: z
        .array(cardSuspensionStatusSchema)
        .describe(
          "Final suspension status of each requested card, read back after the mutation",
        ),
    }),
    annotations: {
      title: "Suspend Cards",
      readOnlyHint: false,
      // Suspending only hides a card from review; nothing about the note,
      // its content, or its scheduling history is discarded.
      destructiveHint: false,
      // Re-suspending an already-suspended card changes nothing further.
      idempotentHint: true,
    },
  })
  async execute(@Payload() params: { cards: number[] }) {
    const cards = Array.isArray(params?.cards)
      ? [...new Set(params.cards)]
      : [];

    try {
      this.logger.log(`Executing suspend: ${cards.length} card(s)`);

      if (cards.length === 0) {
        throw new Error("cards array is required for suspend action");
      }

      // areSuspended reports a nonexistent card ID as null, which doubles as
      // the existence check — suspend itself would silently no-op on bogus IDs.
      const before = await fetchSuspensionStatuses(cards, this.ankiClient);
      const missingIds = findMissingCardIds(before);
      if (missingIds.length > 0) {
        throw new MissingCardIdsError(
          missingIds,
          cards.length,
          "No cards were suspended.",
        );
      }

      const alreadySuspended = before
        .filter((status) => status.suspended === true)
        .map((status) => status.cardId);

      // suspend returns a bare boolean with no per-card detail, so the real
      // outcome comes from the areSuspended read-back below.
      await this.ankiClient.invoke<boolean>("suspend", { cards });

      const after = await fetchSuspensionStatuses(cards, this.ankiClient);
      const cardsChanged = after.filter(
        (status, index) =>
          status.suspended === true && before[index].suspended !== true,
      ).length;
      const stillNotSuspended = after.filter(
        (status) => status.suspended !== true,
      ).length;
      const success = stillNotSuspended === 0;

      this.logger.log(
        `suspend: ${cardsChanged} card(s) newly suspended, ${alreadySuspended.length} already suspended`,
      );

      return {
        success,
        message: success
          ? `Suspended ${cards.length} card(s): ${cardsChanged} newly suspended, ` +
            `${alreadySuspended.length} already suspended`
          : `Requested suspend of ${cards.length} card(s), but ${stillNotSuspended} did not end up suspended`,
        cardsRequested: cards.length,
        cardsChanged,
        alreadySuspended,
        cards: after,
      };
    } catch (error) {
      this.logger.error("Failed to execute suspend", error);
      return createErrorResponse(error, {
        action: "suspend",
        cardIds: cards,
        hint: "Make sure Anki is running and the card IDs are valid card IDs (not note IDs)",
      });
    }
  }
}
