import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for opening Anki Card Browser and searching for cards
 */
@Injectable()
export class GuiBrowseTool {
  private readonly logger = new Logger(GuiBrowseTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiBrowse",
    description:
      "Open Anki Card Browser and search for cards using Anki query syntax. Returns array of card IDs found. " +
      "IMPORTANT: Only use when user explicitly requests opening the browser. " +
      "This tool is for note editing/creation workflows, NOT for review sessions. " +
      "Use this to find and select cards/notes that need editing.",
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          'Anki search query using standard syntax (e.g., "deck:Spanish tag:verb", "is:due", "added:7")',
        ),
      reorderCards: z
        .object({
          order: z
            .enum(["ascending", "descending"])
            .describe("Sort order for the cards in browser"),
          columnId: z
            .string()
            .describe(
              'Column to sort by (e.g., "noteFld", "noteCrt", "cardDue")',
            ),
        })
        .optional()
        .describe("Optional reordering of cards in the browser"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      cardIds: z.array(z.number()),
      cardCount: z.number(),
      query: z.string(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  })
  async guiBrowse(
    {
      query,
      reorderCards,
    }: {
      query: string;
      reorderCards?: {
        order: "ascending" | "descending";
        columnId: string;
      };
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Opening Card Browser with query: "${query}"`);
      await context.reportProgress({ progress: 25, total: 100 });

      const params: any = { query };
      if (reorderCards) {
        params.reorderCards = reorderCards;
      }

      // Call AnkiConnect guiBrowse action
      const cardIds = await this.ankiClient.invoke<number[]>(
        "guiBrowse",
        params,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Card Browser opened with ${cardIds.length} card(s) found`,
      );

      return {
        success: true,
        cardIds,
        cardCount: cardIds.length,
        query,
        message: `Card Browser opened with ${cardIds.length} card(s) matching query "${query}"`,
        hint:
          cardIds.length === 0
            ? "No cards found. Try adjusting your search query."
            : "Use guiSelectCard to select a specific card, or guiSelectedNotes to get selected notes.",
      };
    } catch (error) {
      this.logger.error("Failed to open Card Browser", error);

      if (error instanceof Error) {
        if (
          error.message.includes("query") ||
          error.message.includes("syntax")
        ) {
          return createErrorResponse(error, {
            query,
            hint: 'Invalid search query. Check Anki search syntax. Examples: "deck:MyDeck", "tag:important", "is:due"',
          });
        }
      }

      return createErrorResponse(error, {
        query,
        hint: "Make sure Anki is running and the GUI is visible",
      });
    }
  }
}
