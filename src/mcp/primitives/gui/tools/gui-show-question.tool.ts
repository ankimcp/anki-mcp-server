import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for showing the question side of the current card
 */
@Injectable()
export class GuiShowQuestionTool {
  private readonly logger = new Logger(GuiShowQuestionTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiShowQuestion",
    description:
      "Show the question side of the current card in review mode. Returns true if in review mode, false otherwise. " +
      "CRITICAL: This tool is ONLY for note editing/creation workflows when user needs to view the question side to verify content. " +
      "NEVER use this for conducting review sessions. Use the dedicated review tools (present_card) instead. " +
      "IMPORTANT: Only use when user explicitly requests showing the question.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      inReview: z.boolean(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Show Card Question",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async guiShowQuestion(_args: Record<string, never>, context: Context) {
    try {
      this.logger.log("Showing question side of current card");
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiShowQuestion action
      const inReview = await this.ankiClient.invoke<boolean>("guiShowQuestion");

      await context.reportProgress({ progress: 100, total: 100 });

      if (!inReview) {
        this.logger.warn("Not in review mode");
        return {
          success: true,
          inReview: false,
          message: "Not in review mode - question cannot be shown",
          hint: "Start reviewing a deck in Anki to use this tool.",
        };
      }

      this.logger.log("Question side shown");

      return {
        success: true,
        inReview: true,
        message: "Question side is now displayed",
        hint: "Use guiCurrentCard to get the card details, or guiShowAnswer to reveal the answer.",
      };
    } catch (error) {
      this.logger.error("Failed to show question", error);

      return createErrorResponse(error, {
        hint: "Make sure Anki is running, GUI is visible, and you are in review mode",
      });
    }
  }
}
