import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { deckStats } from "./deckActions/actions/deckStats.action";

@Injectable()
export class DeckStatsTool {
  private readonly logger = new Logger(DeckStatsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deckStats",
    description:
      'Get comprehensive statistics for a single deck including card counts, ease and interval distributions. Pass a deck name (e.g., "Japanese::JLPT N5") and optional bucket boundaries.',
    parameters: z.object({
      deck: z.string().describe('Deck name (e.g., "Japanese::JLPT N5")'),
      easeBuckets: z
        .array(z.number().positive())
        .max(20)
        .optional()
        .describe(
          "Bucket boundaries for ease factor distribution. Default: [2.0, 2.5, 3.0]",
        ),
      intervalBuckets: z
        .array(z.number().positive())
        .max(20)
        .optional()
        .describe(
          "Bucket boundaries for interval distribution in days. Default: [7, 21, 90]",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      deck: z.string(),
      counts: z.object({
        total: z.number(),
        new: z.number(),
        learning: z.number(),
        review: z.number(),
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
    }),
    annotations: {
      title: "Deck Statistics",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(
    params: {
      deck: string;
      easeBuckets?: number[];
      intervalBuckets?: number[];
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Executing deckStats for deck: ${params.deck}`);
      await context.reportProgress({ progress: 10, total: 100 });

      const result = await deckStats(
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
      return result;
    } catch (error) {
      this.logger.error("Failed to execute deckStats", error);
      return createErrorResponse(error, {
        action: "deckStats",
        hint: "Make sure Anki is running and the deck name is valid",
      });
    }
  }
}
