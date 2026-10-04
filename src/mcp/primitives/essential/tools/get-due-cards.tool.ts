import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { AnkiCard, SimplifiedCard } from "@/mcp/types/anki.types";
import { deckScopeQuery } from "@/mcp/utils/card-states.utils";
import { isExistingCardEntry } from "@/mcp/utils/card-validation.utils";
import {
  extractRenderedCardContent,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving cards that are due for review
 */
@McpController()
export class GetDueCardsTool {
  private readonly logger = new Logger(GetDueCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "get_due_cards",
    description:
      "Retrieve cards that are due for review from Anki. Reads the local collection as-is and does not sync with AnkiWeb, so reviews made on other devices since the last sync are not reflected. Answers are not included by default (include_answer=false), so a card's back stays out of the conversation until present_card reveals it; include_answer=true returns the backs too, which suits content analysis or editing rather than a live review.",
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
      include_answer: z
        .boolean()
        .default(false)
        .describe(
          "Whether to include each card's answer (back). Defaults to false so answers are not seen before the user reveals them via present_card; true suits content analysis or editing rather than live review.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      cards: z.array(
        z.object({
          cardId: z.number(),
          front: z.string(),
          back: z
            .string()
            .optional()
            .describe("Present only when include_answer=true"),
          deckName: z.string(),
          modelName: z.string(),
          due: z.number(),
          interval: z.number(),
          factor: z.number(),
        }),
      ),
      total: z
        .number()
        .describe(
          "Number of cards the due-card search matched, including matches beyond limit, minus cards found deleted among the ones looked up (the first limit matches)",
        ),
      returned: z.number().optional(),
      message: z.string(),
    }),
    annotations: {
      title: "Get Due Cards",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getDueCards(
    @Payload()
    {
      deck_name,
      limit,
      include_learning = true,
      include_new = false,
      include_answer = false,
    }: {
      deck_name?: string;
      limit?: number;
      include_learning?: boolean;
      include_new?: boolean;
      include_answer?: boolean;
    },
  ) {
    try {
      const cardLimit = Math.min(limit || 10, 50);

      this.logger.log(
        `Getting due cards from deck: ${deck_name || "all"}, limit: ${cardLimit}`,
      );

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
        // `deck_name` is a literal deck name, not a pattern — deckScopeQuery
        // escapes `"`, `*`, `_` and `\` so a deck like "JLPT_N5" cannot also
        // match a sibling "JLPT-N5".
        query = `${deckScopeQuery(deck_name)} ${query}`;
      }

      // Find cards using AnkiConnect
      const cardIds = await this.ankiClient.invoke<number[]>("findCards", {
        query,
      });

      if (cardIds.length === 0) {
        this.logger.log("No due cards found");
        return {
          success: true,
          message: "No cards are due for review",
          cards: [],
          total: 0,
        };
      }

      // When include_new is true, the result set mixes "new" and actually-due
      // cards. Fetch the new-only subset so we can report honest counts instead
      // of labeling everything as "due".
      let newIdSet = new Set<number>();
      if (include_new) {
        const newOnlyStates = ["is:new"];
        let newQuery = `-is:suspended (${newOnlyStates.join(" OR ")})`;
        if (deck_name) {
          newQuery = `${deckScopeQuery(deck_name)} ${newQuery}`;
        }
        try {
          const newIds = await this.ankiClient.invoke<number[]>("findCards", {
            query: newQuery,
          });
          // Intersect with the result set to avoid counting cards that the
          // outer query happened to exclude (e.g. from a different deck filter).
          const resultSet = new Set(cardIds);
          newIdSet = new Set(newIds.filter((id) => resultSet.has(id)));
        } catch (err) {
          // Non-fatal: fall back to treating all cards as due.
          this.logger.warn(
            `Could not enumerate new cards for count: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // Limit the number of cards
      const selectedCardIds = cardIds.slice(0, cardLimit);

      // Get detailed information for selected cards
      const cardsInfo = await this.ankiClient.invoke<AnkiCard[]>("cardsInfo", {
        cards: selectedCardIds,
      });

      // A card deleted between findCards and cardsInfo comes back as `{}`;
      // it is gone, so it is dropped from the result and from every count.
      const deletedIds = cardsInfo.flatMap((card, index) =>
        isExistingCardEntry(card) ? [] : [selectedCardIds[index]],
      );
      const existingCards = cardsInfo.filter(isExistingCardEntry);
      const total = cardIds.length - deletedIds.length;
      const newCount =
        newIdSet.size - deletedIds.filter((id) => newIdSet.has(id)).length;
      const dueOnlyCount = total - newCount;

      // Transform cards to simplified structure
      const dueCards: SimplifiedCard[] = existingCards.map((card) => {
        const { front, back } = extractRenderedCardContent(card);

        return {
          cardId: card.cardId,
          front,
          ...(include_answer ? { back } : {}),
          deckName: card.deckName,
          modelName: card.modelName,
          due: card.due || 0,
          interval: card.interval || 0,
          factor: card.factor || 2500,
        };
      });

      this.logger.log(
        `Retrieved ${dueCards.length} cards out of ${total} total`,
      );

      const message = include_new
        ? `Found ${total} cards (${newCount} new, ${dueOnlyCount} due), returning ${dueCards.length}`
        : `Found ${total} due cards, returning ${dueCards.length}`;

      return {
        success: true,
        cards: dueCards,
        total,
        returned: dueCards.length,
        message,
      };
    } catch (error) {
      this.logger.error("Failed to get due cards", error);
      return createErrorResponse(error);
    }
  }
}
