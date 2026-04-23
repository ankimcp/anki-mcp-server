import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import type { AnkiDeckStatsResponse } from "@/mcp/types/anki.types";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { computeDistribution } from "@/mcp/utils/stats.utils";
import type {
  CollectionStatsResult,
  CollectionStatsParams,
  PerDeckStats,
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
        .max(20)
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
        .max(20)
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
    outputSchema: z.object({
      total_decks: z.number(),
      counts: z.object({
        total: z.number(),
        new: z.number(),
        learning: z.number(),
        review: z.number(),
        other: z
          .number()
          .describe(
            "Cards not in new/learning/review (typically suspended or buried). " +
              "Computed as total - new - learning - review.",
          ),
      }),
      ease: z.object({
        mean: z.number(),
        median: z.number(),
        min: z.number(),
        max: z.number(),
        count: z.number(),
        buckets: z.record(z.string(), z.number()),
      }),
      intervals: z.object({
        mean: z.number(),
        median: z.number(),
        min: z.number(),
        max: z.number(),
        count: z.number(),
        buckets: z.record(z.string(), z.number()),
      }),
      per_deck: z.array(
        z.object({
          deck: z.string(),
          total: z.number(),
          new: z.number(),
          learning: z.number(),
          review: z.number(),
          other: z.number(),
        }),
      ),
    }),
    annotations: {
      title: "Collection Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: CollectionStatsParams, context: Context) {
    try {
      const { ease_buckets = [2.0, 2.5, 3.0], interval_buckets = [7, 21, 90] } =
        params;

      this.logger.log("Getting collection-wide statistics");
      await context.reportProgress({ progress: 10, total: 100 });

      // Step 1: Get all deck names and their IDs. We need IDs because getDeckStats
      // returns short (child) names (e.g. "Child" for "Parent::Child"), and in some
      // cases AnkiConnect may omit decks from its response entirely — we want every
      // deck from `deckNames` to appear in `per_deck`, falling back to zeros.
      this.logger.log("Fetching deck names and IDs...");
      const deckNamesAndIds = await this.ankiClient.invoke<
        Record<string, number>
      >("deckNamesAndIds", {});

      const deckNames = deckNamesAndIds ? Object.keys(deckNamesAndIds) : [];

      if (deckNames.length === 0) {
        this.logger.log("No decks found in collection");
        const result: CollectionStatsResult = {
          total_decks: 0,
          counts: {
            total: 0,
            new: 0,
            learning: 0,
            review: 0,
            other: 0,
          },
          ease: computeDistribution([], { boundaries: ease_buckets }),
          intervals: computeDistribution([], {
            boundaries: interval_buckets,
            unitSuffix: "d",
          }),
          per_deck: [],
        };

        await context.reportProgress({ progress: 100, total: 100 });
        return result;
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

      // Build per-deck breakdown and aggregate counts. Iterate `deckNames` rather
      // than `Object.values(deckStatsResponse)` so every deck gets an entry, even
      // if getDeckStats silently omits it (observed e.g. with the Default deck on
      // some Anki versions).
      const per_deck: PerDeckStats[] = [];
      const counts = {
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
        other: 0,
      };

      const missingDecks: string[] = [];

      for (const deckName of deckNames) {
        const deckId = deckNamesAndIds[deckName];
        const deckStats =
          deckId != null ? deckStatsResponse[String(deckId)] : undefined;

        if (!deckStats) {
          missingDecks.push(deckName);
          // AnkiConnect didn't return stats for this deck — emit a zero entry so
          // per_deck.length stays consistent with total_decks.
          per_deck.push({
            deck: deckName,
            total: 0,
            new: 0,
            learning: 0,
            review: 0,
            other: 0,
          });
          continue;
        }

        const total = deckStats.total_in_deck ?? 0;
        const newCount = deckStats.new_count ?? 0;
        const learning = deckStats.learn_count ?? 0;
        const review = deckStats.review_count ?? 0;
        // `total_in_deck` from AnkiConnect includes every card in the deck,
        // whereas new/learn/review come from the scheduler's due tree which
        // excludes suspended (and buried) cards. The remainder lives in `other`.
        const other = Math.max(0, total - newCount - learning - review);

        per_deck.push({
          deck: deckName,
          total,
          new: newCount,
          learning,
          review,
          other,
        });

        counts.total += total;
        counts.new += newCount;
        counts.learning += learning;
        counts.review += review;
        counts.other += other;
      }

      if (missingDecks.length > 0) {
        this.logger.warn(
          `getDeckStats did not return stats for ${missingDecks.length} deck(s): ` +
            `${missingDecks.join(", ")}. Filled with zeros.`,
        );
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
        return result;
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
        return result;
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

      return result;
    } catch (error) {
      this.logger.error("Failed to get collection statistics", error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and AnkiConnect is accessible.",
      });
    }
  }
}
