import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { GuiCurrentCardInfo } from "@/mcp/types/anki.types";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for getting information about the current card in review mode
 */
@Injectable()
export class GuiCurrentCardTool {
  private readonly logger = new Logger(GuiCurrentCardTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiCurrentCard",
    description:
      "Get information about the current card displayed in review mode. Returns card details (question, answer, deck, model, etc.) or null if not in review. " +
      "CRITICAL: This tool is ONLY for note editing/creation workflows when user needs to check what card is currently displayed in the GUI. " +
      "NEVER use this for conducting review sessions. Use the dedicated review tools (get_due_cards, present_card, rate_card) instead. " +
      "IMPORTANT: Only use when user explicitly requests current card information.",
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  })
  async guiCurrentCard(_args: Record<string, never>, context: Context) {
    try {
      this.logger.log("Getting current card information from GUI");
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiCurrentCard action
      const cardInfo = await this.ankiClient.invoke<GuiCurrentCardInfo | null>(
        "guiCurrentCard",
      );

      await context.reportProgress({ progress: 100, total: 100 });

      if (!cardInfo) {
        this.logger.log("Not currently in review mode");
        return createSuccessResponse({
          success: true,
          cardInfo: null,
          inReview: false,
          message: "Not currently in review mode",
          hint: "Open a deck in Anki and start reviewing to see current card information.",
        });
      }

      this.logger.log(
        `Retrieved current card: ${cardInfo.cardId} from deck "${cardInfo.deckName}"`,
      );

      return createSuccessResponse({
        success: true,
        cardInfo,
        inReview: true,
        message: `Current card: ${cardInfo.cardId} from deck "${cardInfo.deckName}"`,
        hint: "Use guiEditNote to edit the note associated with this card.",
      });
    } catch (error) {
      this.logger.error("Failed to get current card information", error);

      return createErrorResponse(error, {
        hint: "Make sure Anki is running and the GUI is visible",
      });
    }
  }
}
