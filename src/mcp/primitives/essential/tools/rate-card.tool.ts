import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  getRatingDescription,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";
import {
  AnkiCardInfo,
  isExistingCardEntry,
} from "@/mcp/utils/card-validation.utils";

/**
 * Tool for rating a card and updating Anki's scheduling
 */
@McpController()
export class RateCardTool {
  private readonly logger = new Logger(RateCardTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "rate_card",
    description:
      "Records a real review of a card in Anki's scheduler: it is added to the card's review history and statistics, and the rating sets the card's next due date. The rating is meant to be the user's own assessment of their recall, given after they have seen the answer (present_card with show_answer=true).",
    parameters: z.object({
      card_id: z.number().describe("The ID of the card to rate"),
      rating: z
        .number()
        .min(1)
        .max(4)
        .describe(
          "The user's rating for the card: 1=Again (failed), 2=Hard, 3=Good, 4=Easy",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      cardId: z.number(),
      rating: z.number(),
      ratingDescription: z.string(),
      message: z.string(),
      nextReview: z
        .object({
          interval: z.number(),
          due: z.number(),
          factor: z.number(),
        })
        .nullable()
        .describe(
          "The card's scheduling after the rating, read back from Anki. null when the read-back " +
            "failed or found no card, for example because it was deleted after the rating; the rating itself was still recorded.",
        ),
    }),
    annotations: {
      title: "Rate Card",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async rateCard(
    @Payload() { card_id, rating }: { card_id: number; rating: number },
  ) {
    try {
      // Validate rating
      if (!Number.isInteger(rating) || rating < 1 || rating > 4) {
        return createErrorResponse(
          new Error(
            "Invalid rating. Must be 1 (Again), 2 (Hard), 3 (Good), or 4 (Easy)",
          ),
          { cardId: card_id, attemptedRating: rating },
        );
      }

      this.logger.log(`Rating card ${card_id} with rating ${rating}`);

      // Validate the card ID exists before answering. AnkiConnect's
      // `answerCards` returns `true` even for bogus IDs, so we must
      // pre-check with `cardsInfo` (missing cards come back as `{}`).
      const existingInfo = await this.ankiClient.invoke<
        Array<{ cardId?: number }>
      >("cardsInfo", { cards: [card_id] });

      const found =
        existingInfo?.[0] && typeof existingInfo[0].cardId === "number";

      if (!found) {
        return createErrorResponse(
          new Error(
            `Card ID ${card_id} does not exist in the Anki collection. Cannot rate.`,
          ),
          {
            cardId: card_id,
            attemptedRating: rating,
            hint: "The card ID may be invalid; get_due_cards returns valid card IDs",
          },
        );
      }

      // Convert rating to ease for AnkiConnect
      // AnkiConnect's answerCards expects ease values 1-4
      const answers = [
        {
          cardId: card_id,
          ease: rating,
        },
      ];

      // Submit the rating to Anki
      const result = await this.ankiClient.invoke<boolean>("answerCards", {
        answers,
      });

      if (!result) {
        throw new Error(`Failed to rate card ${card_id}`);
      }

      const ratingDesc = getRatingDescription(rating);

      this.logger.log(`Card ${card_id} rated as ${ratingDesc}`);

      // A failed read-back or a card deleted after the rating (`{}`) leaves the
      // rating recorded, so the result stays a success without scheduling data.
      let cardsInfo: AnkiCardInfo[] | undefined;
      try {
        cardsInfo = await this.ankiClient.invoke<AnkiCardInfo[]>("cardsInfo", {
          cards: [card_id],
        });
      } catch (readBackError) {
        this.logger.warn(
          `Card ${card_id} was rated, but reading back its scheduling failed`,
          readBackError,
        );
      }

      const card = cardsInfo?.[0];
      const nextReview = isExistingCardEntry(card)
        ? {
            interval: card.interval || 0,
            due: card.due || 0,
            factor: card.factor || 2500,
          }
        : null;

      return {
        success: true,
        cardId: card_id,
        rating: rating,
        ratingDescription: ratingDesc,
        message: nextReview
          ? `Card successfully rated as ${ratingDesc}`
          : `Card successfully rated as ${ratingDesc}; its next review could not be read back from Anki`,
        nextReview,
      };
    } catch (error) {
      this.logger.error(`Failed to rate card ${card_id}`, error);

      return createErrorResponse(error, {
        cardId: card_id,
        attemptedRating: rating,
        hint: "This can happen when Anki is not running or the card does not exist",
      });
    }
  }
}
