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
import type {
  CollectionStatsResult,
  CollectionStatsParams,
  PerDeckStats,
  AnkiDeckStatsResponse,
} from "./collection-stats.types";

/**
 * Tool for getting comprehensive collection-wide statistics including distributions
 */
@Injectable()
export class CollectionStatsTool {
  private readonly logger = new Logger(CollectionStatsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "collection_stats",
    description:
      "Get aggregated statistics across all decks in the collection including card counts, ease factor distribution, and interval distribution. " +
      "Provides both collection-wide metrics and per-deck breakdown. " +
      "Use this to analyze overall collection health and compare deck statistics. " +
      "Ease buckets and interval buckets can be customized to focus on specific ranges.",
    parameters: z.object({
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
  async execute(params: CollectionStatsParams, context: Context) {
    try {
      const { ease_buckets = [2.0, 2.5, 3.0], interval_buckets = [7, 21, 90] } =
        params;

      this.logger.log("Getting collection-wide statistics");
      await context.reportProgress({ progress: 10, total: 100 });

      // Step 1: Get all deck names
      this.logger.log("Fetching deck names...");
      const deckNames = await this.ankiClient.invoke<string[]>("deckNames");

      if (!deckNames || deckNames.length === 0) {
        this.logger.log("No decks found in collection");
        const result: CollectionStatsResult = {
          total_decks: 0,
          counts: {
            total: 0,
            new: 0,
            learning: 0,
            review: 0,
          },
          ease: computeDistribution([], { boundaries: ease_buckets }),
          intervals: computeDistribution([], {
            boundaries: interval_buckets,
            unitSuffix: "d",
          }),
          per_deck: [],
        };

        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse(result);
      }

      this.logger.log(`Found ${deckNames.length} decks in collection`);
      await context.reportProgress({ progress: 20, total: 100 });

      // Step 2: Get stats for all decks at once
      this.logger.log("Fetching statistics for all decks...");
      const deckStatsResponse = await this.ankiClient.invoke<
        Record<string, AnkiDeckStatsResponse>
      >("getDeckStats", {
        decks: deckNames,
      });

      if (!deckStatsResponse || typeof deckStatsResponse !== "object") {
        throw new Error("Invalid getDeckStats response");
      }

      // Build per-deck breakdown and aggregate counts
      const per_deck: PerDeckStats[] = [];
      const counts = {
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
      };

      // Process each deck's stats
      for (const deckStats of Object.values(deckStatsResponse)) {
        const deckName = deckStats.name;
        const deckCounts = {
          total: deckStats.total_in_deck ?? 0,
          new: deckStats.new_count ?? 0,
          learning: deckStats.learn_count ?? 0,
          review: deckStats.review_count ?? 0,
        };

        // Add to per-deck breakdown
        per_deck.push({
          deck: deckName,
          ...deckCounts,
        });

        // Aggregate counts
        counts.total += deckCounts.total;
        counts.new += deckCounts.new;
        counts.learning += deckCounts.learning;
        counts.review += deckCounts.review;
      }

      this.logger.log(
        `Aggregated counts: ${counts.total} total cards across ${deckNames.length} decks`,
      );
      await context.reportProgress({ progress: 40, total: 100 });

      // Handle empty collection case
      if (counts.total === 0) {
        this.logger.log("Collection is empty (no cards)");
        const result: CollectionStatsResult = {
          total_decks: deckNames.length,
          counts,
          ease: computeDistribution([], { boundaries: ease_buckets }),
          intervals: computeDistribution([], {
            boundaries: interval_buckets,
            unitSuffix: "d",
          }),
          per_deck,
        };

        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse(result);
      }

      // Step 3: Get all card IDs across the entire collection
      this.logger.log("Finding all cards in collection...");
      const cardIds = await this.ankiClient.invoke<number[]>("findCards", {
        query: "deck:*",
      });

      if (!cardIds || cardIds.length === 0) {
        this.logger.warn(
          "No cards found via findCards, using counts from getDeckStats",
        );
        const result: CollectionStatsResult = {
          total_decks: deckNames.length,
          counts,
          ease: computeDistribution([], { boundaries: ease_buckets }),
          intervals: computeDistribution([], {
            boundaries: interval_buckets,
            unitSuffix: "d",
          }),
          per_deck,
        };

        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse(result);
      }

      this.logger.log(`Found ${cardIds.length} cards in collection`);
      await context.reportProgress({ progress: 50, total: 100 });

      // Step 4: Get ease factors for all cards (divide by 1000!)
      this.logger.log(`Fetching ease factors for ${cardIds.length} cards...`);
      const easeFactorsRaw = await this.ankiClient.invoke<number[]>(
        "getEaseFactors",
        {
          cards: cardIds,
        },
      );

      if (!Array.isArray(easeFactorsRaw)) {
        throw new Error("Invalid getEaseFactors response: expected array");
      }

      // Transform: divide by 1000 and filter invalid values
      const easeValues = easeFactorsRaw
        .map((e) => e / 1000) // 4100 → 4.1
        .filter((e) => e > 0); // Filter out invalid values (0 = new cards)

      this.logger.log(`Processed ${easeValues.length} ease values`);
      await context.reportProgress({ progress: 70, total: 100 });

      // Step 5: Get intervals for all cards (filter negatives!)
      this.logger.log(`Fetching intervals for ${cardIds.length} cards...`);
      const intervalsRaw = await this.ankiClient.invoke<number[]>(
        "getIntervals",
        {
          cards: cardIds,
        },
      );

      if (!Array.isArray(intervalsRaw)) {
        throw new Error("Invalid getIntervals response: expected array");
      }

      // Transform: filter out negative values (learning cards in seconds)
      const intervalValues = intervalsRaw.filter((i) => i > 0); // Only review cards (positive = days)

      this.logger.log(`Processed ${intervalValues.length} interval values`);
      await context.reportProgress({ progress: 90, total: 100 });

      // Step 6: Compute distributions
      this.logger.log("Computing distributions...");
      const ease = computeDistribution(easeValues, {
        boundaries: ease_buckets,
      });

      const intervals = computeDistribution(intervalValues, {
        boundaries: interval_buckets,
        unitSuffix: "d",
      });

      const result: CollectionStatsResult = {
        total_decks: deckNames.length,
        counts,
        ease,
        intervals,
        per_deck,
      };

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Successfully retrieved collection statistics: ${deckNames.length} decks, ` +
          `${counts.total} total cards, ${ease.count} cards with ease values, ` +
          `${intervals.count} review cards`,
      );

      return createSuccessResponse(result);
    } catch (error) {
      this.logger.error("Failed to get collection statistics", error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and AnkiConnect is accessible.",
      });
    }
  }
}
