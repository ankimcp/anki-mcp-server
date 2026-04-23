import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for selecting a specific card in the Card Browser
 */
@Injectable()
export class GuiSelectCardTool {
  private readonly logger = new Logger(GuiSelectCardTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiSelectCard",
    description:
      "Select a specific card in an open Card Browser window. Returns true if browser is open and card was selected, false if browser is not open. " +
      "IMPORTANT: Only use when user explicitly requests selecting a card in the browser. " +
      "This tool is for note editing/creation workflows, NOT for review sessions. " +
      "The Card Browser must already be open (use guiBrowse first).",
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
    },
  })
  async guiSelectCard({ card }: { card: number }, context: Context) {
    try {
      this.logger.log(`Selecting card ${card} in Card Browser`);
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiSelectCard action
      const success = await this.ankiClient.invoke<boolean>("guiSelectCard", {
        card,
      });

      await context.reportProgress({ progress: 100, total: 100 });

      if (!success) {
        this.logger.warn("Card Browser is not open");
        return createErrorResponse(new Error("Card Browser is not open"), {
          cardId: card,
          hint: "Use guiBrowse to open the Card Browser first, then try selecting the card again.",
        });
      }

      this.logger.log(`Successfully selected card ${card} in Card Browser`);

      return {
        success: true,
        cardId: card,
        browserOpen: true,
        message: `Successfully selected card ${card} in Card Browser`,
        hint: "The card is now selected. Use guiEditNote to edit the associated note, or guiSelectedNotes to get note IDs.",
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
            hint: "Card ID not found. Make sure the card exists and is visible in the current browser search.",
          });
        }
      }

      return createErrorResponse(error, {
        cardId: card,
        hint: "Make sure Anki is running, the Card Browser is open, and the card ID is valid",
      });
    }
  }
}
