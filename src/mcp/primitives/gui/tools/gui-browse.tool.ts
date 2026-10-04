import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for opening Anki Card Browser and searching for cards
 */
@McpController()
export class GuiBrowseTool {
  private readonly logger = new Logger(GuiBrowseTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiBrowse",
    description:
      "Opens the Card Browser window in the Anki desktop app on the user's screen and runs a search in it (Anki query syntax). Returns the matching card IDs. " +
      "For when the user asks to open the browser, e.g. to find and edit notes by hand; findNotes searches without opening a window. Not part of a review session.",
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
      title: "Open Card Browser",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiBrowse(
    @Payload()
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
  ) {
    try {
      this.logger.log(`Opening Card Browser with query: "${query}"`);

      const params: any = { query };
      if (reorderCards) {
        params.reorderCards = reorderCards;
      }

      // Call AnkiConnect guiBrowse action
      const cardIds = await this.ankiClient.invoke<number[]>(
        "guiBrowse",
        params,
      );

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
            ? "No cards found; a different search query may match cards."
            : "The Card Browser shows the matching cards.",
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
            hint: 'Invalid search query; it does not follow Anki search syntax. Examples: "deck:MyDeck", "tag:important", "is:due"',
          });
        }
      }

      return createErrorResponse(error, {
        query,
        hint: "This can happen when Anki is not running or its GUI is not visible",
      });
    }
  }
}
