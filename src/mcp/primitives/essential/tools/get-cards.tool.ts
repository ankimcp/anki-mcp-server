import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { AnkiCard, SimplifiedCard } from "@/mcp/types/anki.types";
import {
  extractCardContent,
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Card state enum for filtering cards
 */
const CardStateEnum = z.enum(["due", "new", "learning", "suspended", "buried"]);
type CardState = z.infer<typeof CardStateEnum>;

/**
 * Mapping of card states to Anki search queries
 */
const CARD_STATE_QUERY_MAP: Record<CardState, string> = {
  due: "is:due",
  new: "is:new",
  learning: "is:learn",
  suspended: "is:suspended",
  buried: "is:buried",
};

/**
 * Tool for retrieving cards from Anki with flexible filtering
 */
@Injectable()
export class GetCardsTool {
  private readonly logger = new Logger(GetCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "get_cards",
    description:
      "Retrieve cards from Anki with flexible filtering by deck and card state. IMPORTANT: Use sync tool FIRST before getting cards to ensure latest data. After getting cards, use present_card to show them one by one to the user",
    parameters: z.object({
      deck_name: z
        .string()
        .optional()
        .describe(
          "Specific deck name to get cards from. If not specified, gets cards from all decks",
        ),
      card_state: CardStateEnum.default("due").describe(
        "Filter by card state: 'due' (cards due for review), 'new' (never seen), 'learning' (in learning queue), 'suspended' (manually suspended), 'buried' (temporarily hidden)",
      ),
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Maximum number of cards to return"),
    }),
  })
  async getCards(
    {
      deck_name,
      card_state = "due",
      limit,
    }: { deck_name?: string; card_state?: CardState; limit?: number },
    context: Context,
  ) {
    try {
      const cardLimit = Math.min(limit || 10, 50);

      this.logger.log(
        `Getting ${card_state} cards from deck: ${deck_name || "all"}, limit: ${cardLimit}`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      // Build search query from card state
      const stateQuery = CARD_STATE_QUERY_MAP[card_state];
      // Exclude suspended cards unless explicitly querying for suspended
      const excludeSuspended =
        card_state !== "suspended" ? "-is:suspended " : "";
      let query = `${excludeSuspended}${stateQuery}`;

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
        this.logger.log(`No ${card_state} cards found`);
        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse({
          success: true,
          message: `No ${card_state} cards found`,
          cards: [],
          total: 0,
        });
      }

      await context.reportProgress({ progress: 50, total: 100 });

      // Limit the number of cards
      const selectedCardIds = cardIds.slice(0, cardLimit);

      // Get detailed information for selected cards
      const cardsInfo = await this.ankiClient.invoke<AnkiCard[]>("cardsInfo", {
        cards: selectedCardIds,
      });

      // Transform cards to simplified structure
      const cards: SimplifiedCard[] = cardsInfo.map((card) => {
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
        `Retrieved ${cards.length} ${card_state} cards out of ${cardIds.length} total`,
      );

      return createSuccessResponse({
        success: true,
        cards,
        total: cardIds.length,
        returned: cards.length,
        message: `Found ${cardIds.length} ${card_state} cards, returning ${cards.length}`,
      });
    } catch (error) {
      this.logger.error(`Failed to get ${card_state || "due"} cards`, error);
      return createErrorResponse(error);
    }
  }
}
