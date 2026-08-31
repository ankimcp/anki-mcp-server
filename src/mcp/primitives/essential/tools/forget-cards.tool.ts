import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse, getCardType } from "@/mcp/utils/anki.utils";
import { fetchExistingCards } from "@/mcp/utils/card-validation.utils";

/**
 * Input schema, exported so tests can assert cap/type constraints via
 * `safeParse` without going through the mcp-nest handler.
 */
export const forgetCardsInputSchema = z.object({
  cards: z
    .array(z.number().int().positive())
    .min(1)
    .max(100)
    .describe(
      "Array of card IDs to reset to new (max 100). Card IDs (not note IDs) — use get_cards, " +
        "get_due_cards, or notesInfo to obtain them.",
    ),
});

/**
 * Tool for resetting cards back to the new queue.
 */
@McpController()
export class ForgetCardsTool {
  private readonly logger = new Logger(ForgetCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "forgetCards",
    description:
      "Reset cards to the new queue, discarding their current scheduling (interval, due date, and ease factor). " +
      "Use this when a card should be relearned from scratch — for example when the user keeps failing to recall " +
      "a word that Anki has scheduled months out. Prefer this over rating a card 'Again': a rating records a real " +
      "review and counts as a lapse, which distorts both future scheduling and the collection's statistics. " +
      "The review log is preserved, so past reviews still show in card info and statistics. " +
      "This changes scheduling only — note content, tags, and deck placement are untouched. " +
      "Cards that are already new are unaffected, so re-running is safe.",
    parameters: forgetCardsInputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      cardsAffected: z.number(),
      reset: z
        .array(
          z.object({
            cardId: z.number(),
            previousState: z
              .string()
              .describe(
                "Card state before the reset: new, learning, review, or relearning",
              ),
            previousIntervalDays: z
              .number()
              .describe(
                "Scheduling interval in days before the reset (0 for new cards)",
              ),
            reps: z
              .number()
              .describe(
                "Total reviews logged for the card (unchanged by the reset)",
              ),
            lapses: z
              .number()
              .describe(
                "Total lapses logged for the card (unchanged by the reset)",
              ),
          }),
        )
        .describe(
          "Per-card state captured immediately before the reset, so the caller can report " +
            "what was given up.",
        ),
    }),
    annotations: {
      title: "Reset Cards to New",
      readOnlyHint: false,
      // Scheduling progress is discarded and only Anki's own undo can restore it.
      destructiveHint: true,
      // Resetting an already-new card is a no-op.
      idempotentHint: true,
    },
  })
  async execute(@Payload() params: { cards: number[] }) {
    const cards = Array.isArray(params?.cards)
      ? [...new Set(params.cards)]
      : [];

    try {
      this.logger.log(`Executing forgetCards: ${cards.length} card(s)`);

      if (cards.length === 0) {
        throw new Error("cards array is required for forgetCards action");
      }

      // Capture state before the reset. This doubles as ID validation:
      // AnkiConnect's forgetCards returns null whether or not the cards exist.
      const cardsInfo = await fetchExistingCards(
        cards,
        this.ankiClient,
        "No cards were reset.",
      );

      const reset = cardsInfo.map((card) => ({
        cardId: card.cardId,
        previousState: getCardType(card.type ?? -1),
        previousIntervalDays: card.interval ?? 0,
        reps: card.reps ?? 0,
        lapses: card.lapses ?? 0,
      }));

      // forgetCards returns null on success.
      await this.ankiClient.invoke<null>("forgetCards", { cards });

      this.logger.log(`Reset ${cards.length} card(s) to new`);

      return {
        success: true,
        message: `Successfully reset ${cards.length} card(s) to new`,
        cardsAffected: cards.length,
        reset,
      };
    } catch (error) {
      this.logger.error("Failed to execute forgetCards", error);
      return createErrorResponse(error, {
        action: "forgetCards",
        cardIds: cards,
        hint: "Make sure Anki is running and the card IDs are valid card IDs (not note IDs)",
      });
    }
  }
}
