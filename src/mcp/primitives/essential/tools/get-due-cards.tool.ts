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
    }),
  })
  async getDueCards(
    { deck_name, limit }: { deck_name?: string; limit?: number },
    context: Context,
  ) {
    try {
      const cardLimit = Math.min(limit || 10, 50);

      this.logger.log(
        `Getting due cards from deck: ${deck_name || "all"}, limit: ${cardLimit}`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      // Build search query for due cards
      // Include due, learning, and new cards, but exclude suspended cards
      let query: string;
      if (deck_name) {
        const escapedDeckName = deck_name.replace(/"/g, '\\"');
        query = `"deck:${escapedDeckName}" -is:suspended (is:due OR is:learn OR is:new)`;
        this.logger.log(`🔍 Deck filter requested: "${deck_name}"`);
        this.logger.log(`🔍 Constructed query: ${query}`);
        // Output to stderr for MCP stdio visibility
        console.error(`[get_due_cards] Received deck_name: "${deck_name}"`);
        console.error(`[get_due_cards] Escaped deck name: "${escapedDeckName}"`);
        console.error(`[get_due_cards] Final query: "${query}"`);
      } else {
        query = "-is:suspended (is:due OR is:learn OR is:new)";
        this.logger.log(`🔍 No deck filter - searching all decks`);
        this.logger.log(`🔍 Constructed query: ${query}`);
        console.error(`[get_due_cards] No deck filter, query: "${query}"`);
      }

      // Find due cards using AnkiConnect
      this.logger.log(`📡 Calling AnkiConnect findCards with query: "${query}"`);
      console.error(`[get_due_cards] About to call AnkiConnect.findCards with query: "${query}"`);
      const cardIds = await this.ankiClient.invoke<number[]>("findCards", {
        query,
      });
      this.logger.log(`📊 AnkiConnect returned ${cardIds.length} card ID(s)`);
      console.error(`[get_due_cards] AnkiConnect.findCards returned ${cardIds.length} card ID(s)`);
      if (cardIds.length > 0) {
        this.logger.log(`📋 First few card IDs: ${cardIds.slice(0, 5).join(", ")}`);
        console.error(`[get_due_cards] First 5 card IDs: [${cardIds.slice(0, 5).join(", ")}]`);
      } else {
        this.logger.warn(`⚠️  No due cards found for query: "${query}"`);
        console.error(`[get_due_cards] ⚠️  ZERO cards returned for query: "${query}"`);
        console.error(`[get_due_cards] This suggests either:`);
        console.error(`[get_due_cards]   1. No cards match this query in Anki`);
        console.error(`[get_due_cards]   2. The query syntax is incorrect`);
        console.error(`[get_due_cards]   3. AnkiConnect is not returning the expected data`);
        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse({
          success: true,
          message: "No cards are due for review",
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
        `Retrieved ${dueCards.length} due cards out of ${cardIds.length} total`,
      );

      return createSuccessResponse({
        success: true,
        cards: dueCards,
        total: cardIds.length,
        returned: dueCards.length,
        message: `Found ${cardIds.length} due cards, returning ${dueCards.length}`,
      });
    } catch (error) {
      this.logger.error("Failed to get due cards", error);
      return createErrorResponse(error);
    }
  }
}
