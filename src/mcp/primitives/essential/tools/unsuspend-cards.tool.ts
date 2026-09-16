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
export const unsuspendCardsInputSchema = z.object({
  cards: cardIdsSchema,
});

/**
 * Tool for unsuspending cards so they return to normal review.
 */
@McpController()
export class UnsuspendCardsTool {
  private readonly logger = new Logger(UnsuspendCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "unsuspend",
    description:
      "Unsuspend cards so they return to normal review. Card IDs (not note IDs) — use get_cards, " +
      "get_due_cards, or notesInfo to obtain them. Card IDs are checked for existence before " +
      "anything is changed — AnkiConnect's own unsuspend action doesn't complain about bogus IDs, " +
      "so without this check a typo would silently look like success. Unsuspending a card that's " +
      "already unsuspended is a safe no-op, so re-running with the same IDs is safe.",
    parameters: unsuspendCardsInputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      cardsRequested: z.number(),
      cardsChanged: z
        .number()
        .describe(
          "Cards that WERE suspended before this call and are not suspended now",
        ),
      alreadyUnsuspended: z
        .array(z.number())
        .describe("Card IDs that were already not suspended before this call"),
      cards: z
        .array(cardSuspensionStatusSchema)
        .describe(
          "Final suspension status of each requested card, read back after the mutation",
        ),
    }),
    annotations: {
      title: "Unsuspend Cards",
      readOnlyHint: false,
      // Unsuspending only returns a card to the review queue; nothing about
      // the note, its content, or its scheduling history is discarded.
      destructiveHint: false,
      // Re-unsuspending an already-unsuspended card changes nothing further.
      idempotentHint: true,
    },
  })
  async execute(@Payload() params: { cards: number[] }) {
    const cards = Array.isArray(params?.cards)
      ? [...new Set(params.cards)]
      : [];

    try {
      this.logger.log(`Executing unsuspend: ${cards.length} card(s)`);

      if (cards.length === 0) {
        throw new Error("cards array is required for unsuspend action");
      }

      // areSuspended reports a nonexistent card ID as null, which doubles as
      // the existence check — unsuspend itself would silently no-op on bogus IDs.
      const before = await fetchSuspensionStatuses(cards, this.ankiClient);
      const missingIds = findMissingCardIds(before);
      if (missingIds.length > 0) {
        throw new MissingCardIdsError(
          missingIds,
          cards.length,
          "No cards were unsuspended.",
        );
      }

      const alreadyUnsuspended = before
        .filter((status) => status.suspended === false)
        .map((status) => status.cardId);

      // unsuspend returns a bare boolean with no per-card detail, so the real
      // outcome comes from the areSuspended read-back below.
      await this.ankiClient.invoke<boolean>("unsuspend", { cards });

      const after = await fetchSuspensionStatuses(cards, this.ankiClient);
      const cardsChanged = after.filter(
        (status, index) =>
          status.suspended === false && before[index].suspended !== false,
      ).length;
      const stillSuspended = after.filter(
        (status) => status.suspended !== false,
      ).length;
      const success = stillSuspended === 0;

      this.logger.log(
        `unsuspend: ${cardsChanged} card(s) newly unsuspended, ${alreadyUnsuspended.length} already unsuspended`,
      );

      return {
        success,
        message: success
          ? `Unsuspended ${cards.length} card(s): ${cardsChanged} newly unsuspended, ` +
            `${alreadyUnsuspended.length} already unsuspended`
          : `Requested unsuspend of ${cards.length} card(s), but ${stillSuspended} are still suspended`,
        cardsRequested: cards.length,
        cardsChanged,
        alreadyUnsuspended,
        cards: after,
      };
    } catch (error) {
      this.logger.error("Failed to execute unsuspend", error);
      return createErrorResponse(error, {
        action: "unsuspend",
        cardIds: cards,
        hint: "Make sure Anki is running and the card IDs are valid card IDs (not note IDs)",
      });
    }
  }
}
