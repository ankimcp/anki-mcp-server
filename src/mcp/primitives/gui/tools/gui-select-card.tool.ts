import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for selecting a specific card in the Card Browser
 */
@McpController()
export class GuiSelectCardTool {
  private readonly logger = new Logger(GuiSelectCardTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiSelectCard",
    description:
      "Changes the selection in the Card Browser window open in the Anki desktop app on the user's screen to a single card, clearing the previous selection. " +
      "Returns an error if the Card Browser is not open (guiBrowse opens it). For when the user asks to select a card in the browser. Not part of a review session.",
    parameters: z.object({
      card: z
        .number()
        .positive()
        .describe(
          "Card ID to select in the browser (get from guiBrowse results)",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      cardId: z.number(),
      browserOpen: z.boolean(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Select Card in Browser",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiSelectCard(@Payload() { card }: { card: number }) {
    try {
      this.logger.log(`Selecting card ${card} in Card Browser`);

      // Call AnkiConnect guiSelectCard action
      const success = await this.ankiClient.invoke<boolean>("guiSelectCard", {
        card,
      });

      if (!success) {
        this.logger.warn("Card Browser is not open");
        return createErrorResponse(new Error("Card Browser is not open"), {
          cardId: card,
          hint: "The Card Browser is not open.",
        });
      }

      this.logger.log(`Successfully selected card ${card} in Card Browser`);

      return {
        success: true,
        cardId: card,
        browserOpen: true,
        message: `Successfully selected card ${card} in Card Browser`,
        hint: "The card is now selected in the Card Browser.",
      };
    } catch (error) {
      this.logger.error("Failed to select card in browser", error);

      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("invalid")
        ) {
          return createErrorResponse(error, {
            cardId: card,
            hint: "Card ID not found. Only a card that exists and is visible in the current browser search can be selected.",
          });
        }
      }

      return createErrorResponse(error, {
        cardId: card,
        hint: "This can happen when Anki is not running, the Card Browser is not open, or the card ID is invalid",
      });
    }
  }
}
