import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { changeDeck, type ChangeDeckResult } from "./actions/changeDeck.action";
import { listDecks, type ListDecksResult } from "./actions/listDecks.action";
import { createDeck, type CreateDeckResult } from "./actions/createDeck.action";
import { deckStats, type DeckStatsResult } from "./actions/deckStats.action";

/**
 * Unified deck actions tool for managing Anki deck operations
 * Supports: listDecks, createDeck, deckStats, changeDeck
 */
@Injectable()
export class DeckActionsTool {
  private readonly logger = new Logger(DeckActionsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deckActions",
    description: `Manage Anki deck operations. Supports four actions:
- listDecks: List all decks, optionally with statistics (includeStats: boolean)
- createDeck: Create a new empty deck (deckName: string, max 2 levels like "Parent::Child")
- deckStats: Get comprehensive statistics for a single deck including card counts, ease and interval distributions (deck: string, optional easeBuckets/intervalBuckets arrays)
- changeDeck: Move cards to a different deck (cards: number[], deck: string)

Remember to sync first at the start of a session for latest data.`,
    parameters: z.object({
      action: z
        .enum(["listDecks", "createDeck", "deckStats", "changeDeck"])
        .describe("The deck action to perform"),
      // listDecks params
      includeStats: z
        .boolean()
        .optional()
        .describe("[listDecks] Include card count statistics for each deck"),
      // createDeck params
      deckName: z
        .string()
        .optional()
        .describe(
          '[createDeck] The name of the deck to create. Use "::" for parent::child structure (max 2 levels)',
        ),
      // deckStats params
      deck: z
        .string()
        .optional()
        .describe(
          '[deckStats/changeDeck] Deck name (e.g., "Japanese::JLPT N5")',
        ),
      easeBuckets: z
        .array(z.number().positive())
        .optional()
        .describe(
          "[deckStats] Bucket boundaries for ease factor distribution. Default: [2.0, 2.5, 3.0]",
        ),
      intervalBuckets: z
        .array(z.number().positive())
        .optional()
        .describe(
          "[deckStats] Bucket boundaries for interval distribution in days. Default: [7, 21, 90]",
        ),
      // changeDeck params
      cards: z
        .array(z.number())
        .optional()
        .describe("[changeDeck] Array of card IDs to move"),
    }),
    outputSchema: z.object({
      // listDecks fields
      success: z.boolean(),
      decks: z
        .array(
          z.object({
            name: z.string(),
            stats: z
              .object({
                deck_id: z.number(),
                name: z.string(),
                new_count: z.number(),
                learn_count: z.number(),
                review_count: z.number(),
                total_new: z.number(),
                total_cards: z.number(),
              })
              .optional(),
          }),
        )
        .optional(),
      total: z.number().optional(),
      summary: z
        .object({
          total_cards: z.number(),
          new_cards: z.number(),
          learning_cards: z.number(),
          review_cards: z.number(),
        })
        .optional(),
      message: z.string().optional(),
      // createDeck fields
      deckId: z.number().optional(),
      deckName: z.string().optional(),
      created: z.boolean().optional(),
      exists: z.boolean().optional(),
      parentDeck: z.string().optional(),
      childDeck: z.string().optional(),
      // deckStats fields
      deck: z.string().optional(),
      counts: z
        .object({
          total: z.number(),
          new: z.number(),
          learning: z.number(),
          review: z.number(),
        })
        .optional(),
      ease: z
        .object({
          mean: z.number(),
          median: z.number(),
          min: z.number(),
          max: z.number(),
          count: z.number(),
          buckets: z.record(z.string(), z.number()),
        })
        .optional(),
      intervals: z
        .object({
          mean: z.number(),
          median: z.number(),
          min: z.number(),
          max: z.number(),
          count: z.number(),
          buckets: z.record(z.string(), z.number()),
        })
        .optional(),
      // changeDeck fields
      cardsAffected: z.number().optional(),
      targetDeck: z.string().optional(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  })
  async execute(
    params: {
      action: "listDecks" | "createDeck" | "deckStats" | "changeDeck";
      includeStats?: boolean;
      deckName?: string;
      deck?: string;
      easeBuckets?: number[];
      intervalBuckets?: number[];
      cards?: number[];
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Executing deck action: ${params.action}`);

      let result:
        | ListDecksResult
        | CreateDeckResult
        | DeckStatsResult
        | ChangeDeckResult;

      // Dispatch to appropriate action handler
      switch (params.action) {
        case "listDecks":
          await context.reportProgress({ progress: 10, total: 100 });
          result = await listDecks(
            { includeStats: params.includeStats },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "createDeck":
          if (!params.deckName) {
            throw new Error("deckName is required for createDeck action");
          }
          await context.reportProgress({ progress: 25, total: 100 });
          result = await createDeck(
            { deckName: params.deckName },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "deckStats":
          if (!params.deck) {
            throw new Error("deck name is required for deckStats action");
          }
          await context.reportProgress({ progress: 10, total: 100 });
          result = await deckStats(
            {
              deck: params.deck,
              easeBuckets: params.easeBuckets,
              intervalBuckets: params.intervalBuckets,
            },
            this.ankiClient,
            async (progress) => {
              await context.reportProgress({ progress, total: 100 });
            },
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "changeDeck":
          if (!params.cards || params.cards.length === 0) {
            throw new Error("cards array is required for changeDeck action");
          }
          if (!params.deck) {
            throw new Error("deck name is required for changeDeck action");
          }
          await context.reportProgress({ progress: 25, total: 100 });
          result = await changeDeck(
            { cards: params.cards, deck: params.deck },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        default: {
          // TypeScript exhaustiveness check
          const _exhaustive: never = params.action;
          throw new Error(`Unknown action: ${_exhaustive}`);
        }
      }

      this.logger.log(`Successfully executed ${params.action}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to execute ${params.action}`, error);
      return createErrorResponse(error, {
        action: params.action,
        hint: "Make sure Anki is running and the deck name/card IDs are valid",
      });
    }
  }
}
