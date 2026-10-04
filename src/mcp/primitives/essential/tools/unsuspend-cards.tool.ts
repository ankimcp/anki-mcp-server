import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { MissingCardIdsError } from "@/mcp/utils/card-validation.utils";
import {
  CardSuspensionStatus,
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
      "get_due_cards, or notesInfo to obtain them. Card IDs are checked for existence " +
      "first, and nothing is changed if any is missing — AnkiConnect's own unsuspend action handles " +
      "nonexistent IDs inconsistently (usually an error, sometimes a silent skip depending on input " +
      "order). Unsuspending a card that's " +
      "already unsuspended is a safe no-op, so re-running with the same IDs is safe.",
    parameters: unsuspendCardsInputSchema,
    outputSchema: z.object({
      success: z
        .boolean()
        .describe(
          "False means the call ran but the read-back shows some cards are " +
            "still suspended; inspect `cards` to see which. Retrying with the same " +
            "IDs is safe. A call that failed outright returns an error instead.",
        ),
      message: z.string(),
      cardsRequested: z.number(),
      cardsChanged: z
        .number()
        .optional()
        .describe(
          "Cards that WERE suspended before this call and are not suspended now. " +
            "Omitted when the read-back failed — the unsuspend was still applied.",
        ),
      alreadyUnsuspended: z
        .array(z.number())
        .describe("Card IDs that were already not suspended before this call"),
      cards: z
        .array(cardSuspensionStatusSchema)
        .describe(
          "Final suspension status of each requested card, read back after the " +
            "mutation. Empty when the read-back failed — the unsuspend itself still " +
            "succeeded, so check `message` rather than treating an empty array as a no-op.",
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
      openWorldHint: false,
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
      // the existence check — unsuspend itself handles bogus IDs inconsistently
      // (errors or silently skips them depending on input order).
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

      // The unsuspend is committed from here on. Everything below is reporting,
      // so it gets its own error handling: surfacing a read-back failure as a
      // failed call would invite a retry of a mutation that already landed.
      let after: CardSuspensionStatus[] = [];
      let cardsChanged: number | undefined;
      let stillSuspended = 0;
      let readBackFailed = false;

      try {
        after = await fetchSuspensionStatuses(cards, this.ankiClient);
        cardsChanged = after.filter(
          (status, index) =>
            status.suspended === false && before[index].suspended !== false,
        ).length;
        stillSuspended = after.filter(
          (status) => status.suspended !== false,
        ).length;
      } catch (readBackError) {
        readBackFailed = true;
        this.logger.warn(
          `Unsuspended ${cards.length} card(s) but could not read the new ` +
            `suspension state back`,
          readBackError,
        );
      }

      const success = readBackFailed || stillSuspended === 0;

      if (!readBackFailed) {
        this.logger.log(
          `unsuspend: ${cardsChanged} card(s) newly unsuspended, ${alreadyUnsuspended.length} already unsuspended`,
        );
      }

      return {
        success,
        message: readBackFailed
          ? `Unsuspended ${cards.length} card(s), but reading the new suspension ` +
            `state back failed. The unsuspend was applied, so a retry is not needed.`
          : success
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
        hint: "This can happen when Anki is not running or the card IDs are invalid (note IDs are not card IDs)",
      });
    }
  }
}
