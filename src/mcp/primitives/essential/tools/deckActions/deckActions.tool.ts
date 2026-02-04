import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";
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
      return createSuccessResponse(result);
    } catch (error) {
      this.logger.error(`Failed to execute ${params.action}`, error);
      return createErrorResponse(error, {
        action: params.action,
        hint: "Make sure Anki is running and the deck name/card IDs are valid",
      });
    }
  }
}
