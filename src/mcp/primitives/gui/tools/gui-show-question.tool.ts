import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for showing the question side of the current card
 */
@McpController()
export class GuiShowQuestionTool {
  private readonly logger = new Logger(GuiShowQuestionTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiShowQuestion",
    description:
      "Flips the card on the Anki desktop app's review screen back to its question side, on the user's screen. Does not return the card's content and does not record a review. " +
      "inReview is false (and nothing changes) when Anki is not in review mode. For when the user asks to show the question in Anki; the review tools here (present_card, rate_card) run a review without the Anki window.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      inReview: z.boolean(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Show Card Question",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiShowQuestion(@Payload() _args: Record<string, never>) {
    try {
      this.logger.log("Showing question side of current card");

      // Call AnkiConnect guiShowQuestion action
      const inReview = await this.ankiClient.invoke<boolean>("guiShowQuestion");

      if (!inReview) {
        this.logger.warn("Not in review mode");
        return {
          success: true,
          inReview: false,
          message: "Not in review mode - question cannot be shown",
          hint: "This tool works only while a deck is being reviewed in Anki.",
        };
      }

      this.logger.log("Question side shown");

      return {
        success: true,
        inReview: true,
        message: "Question side is now displayed",
        hint: "The question is shown in Anki's review window.",
      };
    } catch (error) {
      this.logger.error("Failed to show question", error);

      return createErrorResponse(error, {
        hint: "This can happen when Anki is not running, its GUI is not visible, or it is not in review mode",
      });
    }
  }
}
