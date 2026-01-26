import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";
import { computeDistribution } from "@/mcp/utils/stats.utils";
import { DeckStatsResult, AnkiDeckStatsResponse } from "./deck-stats.types";

/**
 * Tool for getting comprehensive deck statistics including distributions
 */
@Injectable()
export class DeckStatsTool {
  private readonly logger = new Logger(DeckStatsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deck_stats",
    description:
      "Get comprehensive statistics for a single deck including card counts, ease factor distribution, and interval distribution. " +
      "Use this to analyze deck health, identify struggling cards (low ease), or understand review scheduling patterns. " +
      "Ease buckets and interval buckets can be customized to focus on specific ranges.",
    parameters: z.object({
      deck: z
        .string()
        .min(1)
        .describe(
          "Deck name to get statistics for (e.g., 'Japanese::JLPT N5')",
        ),
      ease_buckets: z
        .array(z.number().positive())
        .optional()
        .default([2.0, 2.5, 3.0])
        .refine(
          (arr) =>
            arr.length === 0 || arr.every((v, i, a) => i === 0 || v > a[i - 1]),
          {
            message: "Bucket boundaries must be in ascending order",
          },
        )
        .describe(
          "Bucket boundaries for ease factor distribution. Default: [2.0, 2.5, 3.0]. " +
            "Example: [2.0, 2.5, 3.0] creates buckets: <2.0, 2.0-2.5, 2.5-3.0, >3.0",
        ),
      interval_buckets: z
        .array(z.number().positive())
        .optional()
        .default([7, 21, 90])
        .refine(
          (arr) =>
            arr.length === 0 || arr.every((v, i, a) => i === 0 || v > a[i - 1]),
          {
            message: "Bucket boundaries must be in ascending order",
          },
        )
        .describe(
          "Bucket boundaries for interval distribution in days. Default: [7, 21, 90]. " +
            "Example: [7, 21, 90] creates buckets: <7d, 7-21d, 21-90d, >90d",
        ),
    }),
  })
  async execute(
    params: {
      deck: string;
      ease_buckets?: number[];
      interval_buckets?: number[];
    },
    context: Context,
  ) {
    try {
      const {
        deck,
        ease_buckets = [2.0, 2.5, 3.0],
        interval_buckets = [7, 21, 90],
      } = params;

      this.logger.log(`Getting statistics for deck: ${deck}`);
      await context.reportProgress({ progress: 10, total: 100 });

      // Step 1: Get basic card counts from getDeckStats
      this.logger.log("Fetching deck statistics...");
      const deckStatsResponse = await this.ankiClient.invoke<
        Record<string, AnkiDeckStatsResponse>
      >("getDeckStats", {
        decks: [deck],
      });

      // Check if deck exists
      if (!deckStatsResponse || Object.keys(deckStatsResponse).length === 0) {
        throw new Error(`Deck "${deck}" not found`);
      }

      // Extract stats from response (keyed by deck ID)
      const deckStatsArray = Object.values(deckStatsResponse);
      const deckStats = deckStatsArray.find((s) => s.name === deck);

      if (!deckStats) {
        throw new Error(`Deck "${deck}" not found in statistics response`);
      }

      const counts = {
        total: deckStats.total_in_deck || 0,
        new: deckStats.new_count || 0,
        learning: deckStats.learn_count || 0,
        review: deckStats.review_count || 0,
      };

      await context.reportProgress({ progress: 30, total: 100 });

      // Handle empty deck case
      if (counts.total === 0) {
        this.logger.log(`Deck "${deck}" is empty`);
        const result: DeckStatsResult = {
          deck,
          counts,
          ease: computeDistribution([], { boundaries: ease_buckets }),
          intervals: computeDistribution([], {
            boundaries: interval_buckets,
            unitSuffix: "d",
          }),
        };

        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse(result);
      }

      // Step 2: Get all card IDs for this deck
      this.logger.log("Finding cards in deck...");
      // Escape special characters in deck name for Anki search
      const escapedDeckName = deck.replace(/"/g, '\\"');
      const cardIds = await this.ankiClient.invoke<number[]>("findCards", {
        query: `"deck:${escapedDeckName}"`,
      });

      if (!cardIds || cardIds.length === 0) {
        this.logger.warn(
          `No cards found via findCards for deck "${deck}", using counts from getDeckStats`,
        );
        const result: DeckStatsResult = {
          deck,
          counts,
          ease: computeDistribution([], { boundaries: ease_buckets }),
          intervals: computeDistribution([], {
            boundaries: interval_buckets,
            unitSuffix: "d",
          }),
        };

        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse(result);
      }

      await context.reportProgress({ progress: 50, total: 100 });

      // Step 3: Get ease factors (divide by 1000!)
      this.logger.log(`Fetching ease factors for ${cardIds.length} cards...`);
      const easeFactorsRaw = await this.ankiClient.invoke<number[]>(
        "getEaseFactors",
        {
          cards: cardIds,
        },
      );

      // Transform: divide by 1000 and filter invalid values
      const easeValues = easeFactorsRaw
        .map((e) => e / 1000) // 4100 → 4.1
        .filter((e) => e > 0); // Filter out invalid values (0 = new cards)

      await context.reportProgress({ progress: 70, total: 100 });

      // Step 4: Get intervals (filter negatives = learning cards)
      this.logger.log(`Fetching intervals for ${cardIds.length} cards...`);
      const intervalsRaw = await this.ankiClient.invoke<number[]>(
        "getIntervals",
        {
          cards: cardIds,
        },
      );

      // Transform: filter out negative values (learning cards in seconds)
      const intervalValues = intervalsRaw.filter((i) => i > 0); // Only review cards (positive = days)

      await context.reportProgress({ progress: 90, total: 100 });

      // Step 5: Compute distributions
      this.logger.log("Computing distributions...");
      const ease = computeDistribution(easeValues, {
        boundaries: ease_buckets,
      });

      const intervals = computeDistribution(intervalValues, {
        boundaries: interval_buckets,
        unitSuffix: "d",
      });

      const result: DeckStatsResult = {
        deck,
        counts,
        ease,
        intervals,
      };

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Successfully retrieved statistics for deck "${deck}": ${counts.total} total cards, ` +
          `${ease.count} cards with ease values, ${intervals.count} review cards`,
      );

      return createSuccessResponse(result);
    } catch (error) {
      this.logger.error(`Failed to get deck statistics`, error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and the deck name is correct. Use list_decks to see available decks.",
      });
    }
  }
}
