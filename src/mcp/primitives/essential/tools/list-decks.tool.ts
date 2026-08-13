import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { listDecks } from "./deckActions/actions/listDecks.action";

@McpController()
export class ListDecksTool {
  private readonly logger = new Logger(ListDecksTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "listDecks",
    description:
      "List all Anki decks, optionally with per-deck study-queue statistics. " +
      "IMPORTANT: those statistics are Anki's deck-browser numbers — cards DUE TODAY, capped by each deck's daily new/review limits, excluding suspended and buried cards — NOT totals per card state. " +
      "Use the `deckStats` tool (its `states` block) or `collection_stats` for true card-state counts. " +
      "Remember to sync first at the start of a session for latest data.",
    parameters: z.object({
      includeStats: z
        .boolean()
        .optional()
        .describe("Include card count statistics for each deck"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      decks: z.array(
        z.object({
          name: z.string(),
          stats: z
            .object({
              deck_id: z.number(),
              name: z.string(),
              new_count: z
                .number()
                .describe(
                  "New cards due today, capped by the daily new-card limit. " +
                    "Subdecks included. Not the total number of new cards.",
                ),
              learn_count: z
                .number()
                .describe(
                  "Learning/relearning cards due now or today. Subdecks included.",
                ),
              review_count: z
                .number()
                .describe(
                  "Review cards DUE TODAY, capped by the daily review limit. " +
                    "Subdecks included. Not 'mature' cards and not all review cards.",
                ),
              total_new: z
                .number()
                .describe(
                  "Misleading legacy name: same value as new_count (new cards " +
                    "due today), NOT the total number of new cards.",
                ),
              total_cards: z
                .number()
                .describe(
                  "Cards stored directly in this deck, subdecks NOT included, " +
                    "suspended and buried included.",
                ),
            })
            .optional()
            .describe(
              "Study-queue counts from Anki's deck browser (due today, capped " +
                "by daily limits) — not per-state card totals.",
            ),
        }),
      ),
      total: z.number(),
      summary: z
        .object({
          total_cards: z
            .number()
            .describe(
              "Total cards in the collection: sum of every deck's own card " +
                "count (subdecks are separate rows, so nothing is missed or " +
                "double-counted).",
            ),
          new_cards: z
            .number()
            .describe(
              "New cards due across the collection today, capped by daily " +
                "limits. Summed over ROOT decks only, because the per-deck " +
                "counts are already rolled up over subdecks. Not the total " +
                "number of new cards.",
            ),
          learning_cards: z
            .number()
            .describe(
              "Learning/relearning cards due now or today across the " +
                "collection. Summed over ROOT decks only, like new_cards.",
            ),
          review_cards: z
            .number()
            .describe(
              "Review cards DUE TODAY across the collection, capped by daily " +
                "limits. Summed over ROOT decks only, like new_cards. Not all " +
                "review cards.",
            ),
        })
        .optional()
        .describe(
          "Collection-wide totals with study-queue semantics, not card-state " +
            "totals. Use collection_stats for true per-state counts.",
        ),
      message: z.string().optional(),
    }),
    annotations: {
      title: "List Decks",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(@Payload() params: { includeStats?: boolean }) {
    try {
      this.logger.log("Executing listDecks");

      const result = await listDecks(
        { includeStats: params.includeStats },
        this.ankiClient,
      );

      return result;
    } catch (error) {
      this.logger.error("Failed to execute listDecks", error);
      return createErrorResponse(error, {
        action: "listDecks",
        hint: "Make sure Anki is running",
      });
    }
  }
}
