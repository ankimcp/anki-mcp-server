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
      "first, and nothing is changed if any is missing — AnkiConnect's own suspend action handles " +
      "nonexistent IDs inconsistently (usually an error, sometimes a silent skip depending on input " +
      "order). Suspending a card that's " +
      "already suspended is a safe no-op, so re-running with the same IDs is safe. A suspended card " +
      "silently drops out of the user's reviews (in Anki and on synced devices) until it is unsuspended.",
    parameters: suspendCardsInputSchema,
    outputSchema: z.object({
      success: z
        .boolean()
        .describe(
          "False means the call ran but the read-back shows some cards are not " +
            "suspended; inspect `cards` to see which. Retrying with the same IDs " +
            "is safe. A call that failed outright returns an error instead.",
        ),
      message: z.string(),
      cardsRequested: z.number(),
      cardsChanged: z
        .number()
        .optional()
        .describe(
          "Cards that were NOT suspended before this call and are suspended now. " +
            "Omitted when the read-back failed — the suspend was still applied.",
        ),
      alreadySuspended: z
        .array(z.number())
        .describe("Card IDs that were already suspended before this call"),
      cards: z
        .array(cardSuspensionStatusSchema)
        .describe(
          "Final suspension status of each requested card, read back after the " +
            "mutation. Empty when the read-back failed — the suspend itself still " +
            "succeeded, so check `message` rather than treating an empty array as a no-op.",
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
      openWorldHint: false,
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
      // the existence check — suspend itself handles bogus IDs inconsistently
      // (errors or silently skips them depending on input order).
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

      // The suspend is committed from here on. Everything below is reporting,
      // so it gets its own error handling: surfacing a read-back failure as a
      // failed call would invite a retry of a mutation that already landed.
      let after: CardSuspensionStatus[] = [];
      let cardsChanged: number | undefined;
      let stillNotSuspended = 0;
      let readBackFailed = false;

      try {
        after = await fetchSuspensionStatuses(cards, this.ankiClient);
        cardsChanged = after.filter(
          (status, index) =>
            status.suspended === true && before[index].suspended !== true,
        ).length;
        stillNotSuspended = after.filter(
          (status) => status.suspended !== true,
        ).length;
      } catch (readBackError) {
        readBackFailed = true;
        this.logger.warn(
          `Suspended ${cards.length} card(s) but could not read the new ` +
            `suspension state back`,
          readBackError,
        );
      }

      const success = readBackFailed || stillNotSuspended === 0;

      if (!readBackFailed) {
        this.logger.log(
          `suspend: ${cardsChanged} card(s) newly suspended, ${alreadySuspended.length} already suspended`,
        );
      }

      return {
        success,
        message: readBackFailed
          ? `Suspended ${cards.length} card(s), but reading the new suspension ` +
            `state back failed. The suspend was applied, so a retry is not needed.`
          : success
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
        hint: "This can happen when Anki is not running or the card IDs are invalid (note IDs are not card IDs)",
      });
    }
  }
}
