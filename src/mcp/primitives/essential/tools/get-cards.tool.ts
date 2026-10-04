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
@McpController()
export class GetCardsTool {
  private readonly logger = new Logger(GetCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "get_cards",
    description:
      "Retrieve cards from Anki with flexible filtering by deck and card state. Reads the local collection as-is and does not sync with AnkiWeb, so reviews made on other devices since the last sync are not reflected. Answers are not included by default (include_answer=false), so a card's back stays out of the conversation until present_card reveals it; include_answer=true returns the backs too, which suits content analysis or editing rather than a live review.",
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
          "Number of cards the search matched, including matches beyond limit, minus cards found deleted among the ones looked up (the first limit matches)",
        ),
      returned: z.number().optional(),
      message: z.string(),
    }),
    annotations: {
      title: "Get Cards",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async getCards(
    @Payload()
    {
      deck_name,
      card_state = "due",
      limit,
      include_answer = false,
    }: {
      deck_name?: string;
      card_state?: CardState;
      limit?: number;
      include_answer?: boolean;
    },
  ) {
    try {
      const cardLimit = Math.min(limit || 10, 50);

      this.logger.log(
        `Getting ${card_state} cards from deck: ${deck_name || "all"}, limit: ${cardLimit}`,
      );

      // Build search query from card state
      const stateQuery = CARD_STATE_QUERY_MAP[card_state];
      // Exclude suspended cards unless explicitly querying for suspended
      const excludeSuspended =
        card_state !== "suspended" ? "-is:suspended " : "";
      let query = `${excludeSuspended}${stateQuery}`;

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
        this.logger.log(`No ${card_state} cards found`);
        return {
          success: true,
          message: `No ${card_state} cards found`,
          cards: [],
          total: 0,
        };
      }

      // Limit the number of cards
      const selectedCardIds = cardIds.slice(0, cardLimit);

      // Get detailed information for selected cards
      const cardsInfo = await this.ankiClient.invoke<AnkiCard[]>("cardsInfo", {
        cards: selectedCardIds,
      });

      // A card deleted between findCards and cardsInfo comes back as `{}`;
      // it is gone, so it is dropped from the result and from the total.
      const existingCards = cardsInfo.filter(isExistingCardEntry);
      const total = cardIds.length - (cardsInfo.length - existingCards.length);

      // Transform cards to simplified structure
      const cards: SimplifiedCard[] = existingCards.map((card) => {
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
        `Retrieved ${cards.length} ${card_state} cards out of ${total} total`,
      );

      return {
        success: true,
        cards,
        total,
        returned: cards.length,
        message: `Found ${total} ${card_state} cards, returning ${cards.length}`,
      };
    } catch (error) {
      this.logger.error(`Failed to get ${card_state || "due"} cards`, error);
      return createErrorResponse(error);
    }
  }
}
