import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { listDecks } from "./deckActions/actions/listDecks.action";

@Injectable()
export class ListDecksTool {
  private readonly logger = new Logger(ListDecksTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "listDecks",
    description:
      "List all Anki decks, optionally with card count statistics for each deck. Remember to sync first at the start of a session for latest data.",
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
              new_count: z.number(),
              learn_count: z.number(),
              review_count: z.number(),
              total_new: z.number(),
              total_cards: z.number(),
            })
            .optional(),
        }),
      ),
      total: z.number(),
      summary: z
        .object({
          total_cards: z.number(),
          new_cards: z.number(),
          learning_cards: z.number(),
          review_cards: z.number(),
        })
        .optional(),
      message: z.string().optional(),
    }),
    annotations: {
      title: "List Decks",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { includeStats?: boolean }, context: Context) {
    try {
      this.logger.log("Executing listDecks");
      await context.reportProgress({ progress: 10, total: 100 });

      const result = await listDecks(
        { includeStats: params.includeStats },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
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
