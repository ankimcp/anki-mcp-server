import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for opening the Deck Overview dialog for a specific deck
 */
@McpController()
export class GuiDeckOverviewTool {
  private readonly logger = new Logger(GuiDeckOverviewTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiDeckOverview",
    description:
      "Makes the named deck Anki's current deck and switches the Anki desktop app's main window on the user's screen to that deck's overview (due counts and the Study Now button). " +
      "Returns an error if the deck does not exist. For when the user asks to open a deck in Anki; deckStats returns the numbers without changing the screen. Not part of a review session.",
    parameters: z.object({
      name: z
        .string()
        .min(1)
        .describe("Deck name to open (get from listDecks)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      deckName: z.string(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Open Deck Overview",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiDeckOverview(@Payload() { name }: { name: string }) {
    try {
      this.logger.log(`Opening Deck Overview for deck "${name}"`);

      // Call AnkiConnect guiDeckOverview action
      const success = await this.ankiClient.invoke<boolean>("guiDeckOverview", {
        name,
      });

      if (!success) {
        this.logger.warn(`Failed to open Deck Overview for deck "${name}"`);
        return createErrorResponse(
          new Error(`Failed to open Deck Overview for deck "${name}"`),
          {
            deckName: name,
            hint: "Deck not found or Anki GUI is not responding. listDecks lists the available decks.",
          },
        );
      }

      this.logger.log(`Deck Overview opened for deck "${name}"`);

      return {
        success: true,
        deckName: name,
        message: `Deck Overview opened for deck "${name}"`,
        hint: "The deck statistics and study options are now visible in the Anki GUI.",
      };
    } catch (error) {
      this.logger.error("Failed to open Deck Overview", error);

      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("invalid")
        ) {
          return createErrorResponse(error, {
            deckName: name,
            hint: "Deck not found. listDecks lists the available decks.",
          });
        }
      }

      return createErrorResponse(error, {
        deckName: name,
        hint: "This can happen when Anki is not running or the deck name is wrong",
      });
    }
  }
}
