import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for opening the Deck Browser dialog
 */
@McpController()
export class GuiDeckBrowserTool {
  private readonly logger = new Logger(GuiDeckBrowserTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiDeckBrowser",
    description:
      "Switches the Anki desktop app's main window on the user's screen to the deck list (Deck Browser), leaving any screen it was on, such as an in-progress review. " +
      "For when the user asks to see their decks in Anki; listDecks returns the deck list without changing the screen. Not part of a review session.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Open Deck Browser",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiDeckBrowser(@Payload() _args: Record<string, never>) {
    try {
      this.logger.log("Opening Deck Browser");

      // Call AnkiConnect guiDeckBrowser action
      await this.ankiClient.invoke<null>("guiDeckBrowser");

      this.logger.log("Deck Browser opened");

      return {
        success: true,
        message: "Deck Browser opened successfully",
        hint: "All decks are now visible in the Anki GUI. User can select a deck to study or manage.",
      };
    } catch (error) {
      this.logger.error("Failed to open Deck Browser", error);

      return createErrorResponse(error, {
        hint: "This can happen when Anki is not running or its GUI is not visible",
      });
    }
  }
}
