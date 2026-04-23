import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import type { AnkiDeckStatsResponse } from "@/mcp/types/anki.types";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import {
  getRootDeckNames,
  rollupDeckTotal,
} from "@/mcp/utils/deck-hierarchy.utils";
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
      "Per-deck counts are rolled up over descendants (a parent deck includes its children), matching Anki's deck browser. " +
      "Collection-level `counts` sum the ROOT decks only to avoid double-counting children. " +
      "Invariant: for every deck and for the collection, total === new + learning + review + other. " +
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
      counts: z
        .object({
          total: z
            .number()
            .describe(
              "Total cards in the collection. Computed as the sum of " +
                "ROOT-deck rolled-up totals (decks without `::` in the name), " +
                "which prevents double-counting children. Invariant: " +
                "total === new + learning + review + other.",
            ),
          new: z
            .number()
            .describe(
              "New cards (never studied), summed over root decks' rolled-up counts.",
            ),
          learning: z
            .number()
            .describe(
              "Learning/relearning cards, summed over root decks' rolled-up counts.",
            ),
          review: z
            .number()
            .describe(
              "Review cards (mature), summed over root decks' rolled-up counts.",
            ),
          other: z
            .number()
            .describe(
              "Cards not in new/learning/review (typically suspended or buried), " +
                "summed over root decks' rolled-up counts. " +
                "Computed as total - new - learning - review.",
            ),
        })
        .describe(
          "Aggregated card counts across the collection. Summed over ROOT " +
            "decks only (names without `::`) so that a parent's rollup is not " +
            "added on top of its children.",
        ),
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
      per_deck: z
        .array(
          z.object({
            deck: z.string(),
            total: z.number(),
            new: z.number(),
            learning: z.number(),
            review: z.number(),
            other: z.number(),
          }),
        )
        .describe(
          "Per-deck breakdown with one entry per deck. Each entry's counts " +
            'are rolled up over that deck\'s descendants (entry for "German" ' +
            'includes cards from "German::Verbs"). Invariant per row: ' +
            "total === new + learning + review + other.",
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

      // AnkiConnect's `total_in_deck` covers only cards directly in that deck's
      // table (no descendants), whereas new/learn/review come from the
      // scheduler's due tree and ARE rolled up over descendants. To make the
      // arithmetic close (`total >= new + learning + review`) we need to roll
      // up `total_in_deck` ourselves. Build a name → own-total map once,
      // then derive each deck's rolled-up total from it.
      const perDeckOwnTotal = new Map<string, number>();
      const perDeckStats = new Map<string, AnkiDeckStatsResponse>();
      const missingDecks: string[] = [];

      for (const deckName of deckNames) {
        const deckId = deckNamesAndIds[deckName];
        const deckStats =
          deckId != null ? deckStatsResponse[String(deckId)] : undefined;

        if (!deckStats) {
          missingDecks.push(deckName);
          // AnkiConnect silently omitted this deck — fill with zeros so the
          // rollup doesn't skip it and `per_deck.length` stays consistent
          // with `total_decks`.
          perDeckOwnTotal.set(deckName, 0);
          continue;
        }

        perDeckOwnTotal.set(deckName, deckStats.total_in_deck ?? 0);
        perDeckStats.set(deckName, deckStats);
      }

      // Build per-deck breakdown with rolled-up totals.
      const per_deck: PerDeckStats[] = [];
      for (const deckName of deckNames) {
        const stats = perDeckStats.get(deckName);
        const newCount = stats?.new_count ?? 0;
        const learning = stats?.learn_count ?? 0;
        const review = stats?.review_count ?? 0;

        // Rolled-up total = this deck's own cards + all descendants' own cards.
        // The scheduler's new/learn/review for a parent ALREADY include
        // descendants, so rolling up `total` here keeps all four fields
        // consistent and `other` non-negative.
        const total = rollupDeckTotal(deckName, perDeckOwnTotal);
        const other = Math.max(0, total - newCount - learning - review);

        per_deck.push({
          deck: deckName,
          total,
          new: newCount,
          learning,
          review,
          other,
        });
      }

      if (missingDecks.length > 0) {
        this.logger.warn(
          `getDeckStats did not return stats for ${missingDecks.length} deck(s): ` +
            `${missingDecks.join(", ")}. Filled with zeros.`,
        );
      }

      // Collection-level counts: sum over ROOT decks only. Each root's
      // per-deck entry is already rolled up over its entire subtree, so
      // summing all decks (including children) would double-count.
      const rootDeckNames = new Set(getRootDeckNames(deckNames));
      const counts = {
        total: 0,
        new: 0,
        learning: 0,
        review: 0,
        other: 0,
      };
      for (const entry of per_deck) {
        if (!rootDeckNames.has(entry.deck)) continue;
        counts.total += entry.total;
        counts.new += entry.new;
        counts.learning += entry.learning;
        counts.review += entry.review;
        counts.other += entry.other;
      }

      this.logger.log(
        `Aggregated counts: ${counts.total} total cards across ${rootDeckNames.size} root deck(s) ` +
          `(${deckNames.length} total decks including children)`,
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
