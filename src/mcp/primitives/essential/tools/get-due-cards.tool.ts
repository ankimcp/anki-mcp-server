import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { AnkiCard, SimplifiedCard } from "@/mcp/types/anki.types";
import {
  extractCardContent,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving cards that are due for review
 */
@Injectable()
export class GetDueCardsTool {
  private readonly logger = new Logger(GetDueCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "get_due_cards",
    description:
      "Retrieve cards that are due for review from Anki. IMPORTANT: Use sync tool FIRST before getting cards to ensure latest data. After getting cards, use present_card to show them one by one to the user",
    parameters: z.object({
      deck_name: z
        .string()
        .optional()
        .describe(
          "Specific deck name to get cards from. If not specified, gets cards from all decks",
        ),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of cards to return"),
      include_learning: z
        .boolean()
        .default(true)
        .describe(
          "Include cards in learning phase (seen but not yet graduated). Default: true",
        ),
      include_new: z
        .boolean()
        .default(false)
        .describe("Include new cards (never seen before). Default: false"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      cards: z.array(
        z.object({
          cardId: z.number(),
          front: z.string(),
          back: z.string(),
          deckName: z.string(),
          modelName: z.string(),
          due: z.number(),
          interval: z.number(),
          factor: z.number(),
        }),
      ),
      total: z.number(),
      returned: z.number().optional(),
      message: z.string(),
    }),
    annotations: {
      title: "Get Due Cards",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async getDueCards(
    {
      deck_name,
      limit,
      include_learning = true,
      include_new = false,
    }: {
      deck_name?: string;
      limit?: number;
      include_learning?: boolean;
      include_new?: boolean;
    },
    context: Context,
  ) {
    try {
      const cardLimit = Math.min(limit || 10, 50);

      this.logger.log(
        `Getting due cards from deck: ${deck_name || "all"}, limit: ${cardLimit}`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      // Build search query for due cards
      // Always exclude suspended cards, include due cards, optionally learning and new
      const states: string[] = ["is:due"];
      if (include_learning) {
        states.push("is:learn");
      }
      if (include_new) {
        states.push("is:new");
      }

      let query = `-is:suspended (${states.join(" OR ")})`;
      if (deck_name) {
        // Escape special characters in deck name for Anki search
        const escapedDeckName = deck_name.replace(/"/g, '\\"');
        query = `"deck:${escapedDeckName}" ${query}`;
      }

      // Find cards using AnkiConnect
      const cardIds = await this.ankiClient.invoke<number[]>("findCards", {
        query,
      });

      if (cardIds.length === 0) {
        this.logger.log("No due cards found");
        await context.reportProgress({ progress: 100, total: 100 });
        return {
          success: true,
          message: "No cards are due for review",
          cards: [],
          total: 0,
        };
      }

      await context.reportProgress({ progress: 50, total: 100 });

      // When include_new is true, the result set mixes "new" and actually-due
      // cards. Fetch the new-only subset so we can report honest counts instead
      // of labeling everything as "due".
      let newCount = 0;
      if (include_new) {
        const newOnlyStates = ["is:new"];
        let newQuery = `-is:suspended (${newOnlyStates.join(" OR ")})`;
        if (deck_name) {
          const escapedDeckName = deck_name.replace(/"/g, '\\"');
          newQuery = `"deck:${escapedDeckName}" ${newQuery}`;
        }
        try {
          const newIds = await this.ankiClient.invoke<number[]>("findCards", {
            query: newQuery,
          });
          // Intersect with the result set to avoid counting cards that the
          // outer query happened to exclude (e.g. from a different deck filter).
          const resultSet = new Set(cardIds);
          newCount = newIds.filter((id) => resultSet.has(id)).length;
        } catch (err) {
          // Non-fatal: fall back to treating all cards as due.
          this.logger.warn(
            `Could not enumerate new cards for count: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
      const dueOnlyCount = cardIds.length - newCount;

      // Limit the number of cards
      const selectedCardIds = cardIds.slice(0, cardLimit);

      // Get detailed information for selected cards
      const cardsInfo = await this.ankiClient.invoke<AnkiCard[]>("cardsInfo", {
        cards: selectedCardIds,
      });

      // Transform cards to simplified structure
      const dueCards: SimplifiedCard[] = cardsInfo.map((card) => {
        const { front, back } = extractCardContent(card.fields);

        return {
          cardId: card.cardId,
          front: front || card.question || "",
          back: back || card.answer || "",
          deckName: card.deckName,
          modelName: card.modelName,
          due: card.due || 0,
          interval: card.interval || 0,
          factor: card.factor || 2500,
        };
      });

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Retrieved ${dueCards.length} cards out of ${cardIds.length} total`,
      );

      const message = include_new
        ? `Found ${cardIds.length} cards (${newCount} new, ${dueOnlyCount} due), returning ${dueCards.length}`
        : `Found ${cardIds.length} due cards, returning ${dueCards.length}`;

      return {
        success: true,
        cards: dueCards,
        total: cardIds.length,
        returned: dueCards.length,
        message,
      };
    } catch (error) {
      this.logger.error("Failed to get due cards", error);
      return createErrorResponse(error);
    }
  }
}
