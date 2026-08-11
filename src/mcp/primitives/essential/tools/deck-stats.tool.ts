import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import {
  cardStatesSchema,
  DUE_TREE_INVARIANT_NOTE,
  dueTreeCountsSchema,
} from "@/mcp/utils/card-states.utils";
import { deckStats } from "./deckActions/actions/deckStats.action";

@Injectable()
export class DeckStatsTool {
  private readonly logger = new Logger(DeckStatsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deckStats",
    description:
      'Get comprehensive statistics for a single deck including card counts, ease and interval distributions. Pass a deck name (e.g., "Japanese::JLPT N5") and optional bucket boundaries. ' +
      "Returns TWO different views, do not mix them up: " +
      "`counts` is today's study queue as shown in Anki's deck browser (cards DUE TODAY, capped by the deck's daily new/review limits, suspended/buried excluded); " +
      "`states` is the true number of cards in each state (new / learning / review / suspended / buried), ignoring due dates and daily limits. " +
      'To answer "how many cards do I have" use `states`; to answer "what will I study today" use `counts`. ' +
      "Both are rolled up over descendant decks (parent decks include their children). " +
      "`states` costs 5 additional Anki searches per call. " +
      `For counts: ${DUE_TREE_INVARIANT_NOTE}`,
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
      counts: dueTreeCountsSchema({
        scope: "this deck and all of its descendants",
        total:
          "Total cards in this deck AND all of its descendants, including " +
          'suspended and buried. Example: stats for "German" include cards in ' +
          '"German::Verbs" and "German::Verbs::Irregular".',
        note: "All four bucket counts are rolled up over descendant decks.",
      }),
      states: cardStatesSchema("this deck and all of its subdecks"),
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
  async execute(params: {
    deck: string;
    easeBuckets?: number[];
    intervalBuckets?: number[];
  }) {
    try {
      this.logger.log(`Executing deckStats for deck: ${params.deck}`);

      const result = await deckStats(
        {
          deck: params.deck,
          easeBuckets: params.easeBuckets,
          intervalBuckets: params.intervalBuckets,
        },
        this.ankiClient,
      );

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
