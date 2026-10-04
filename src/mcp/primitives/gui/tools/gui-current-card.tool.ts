import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { GuiCurrentCardInfo } from "@/mcp/types/anki.types";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for getting information about the current card in review mode
 */
@McpController()
export class GuiCurrentCardTool {
  private readonly logger = new Logger(GuiCurrentCardTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiCurrentCard",
    description:
      "Reads the card currently shown in the Anki desktop app's review screen: question, answer, fields, deck, note type and answer buttons. Changes nothing on screen. " +
      "The result always includes the answer, so calling it while the user is reviewing in Anki reveals the answer before they respond; present_card can show a card without its answer. " +
      "When Anki is not in review mode, AnkiConnect reports an error ('Gui review is not currently active.').",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      cardInfo: z
        .object({
          answer: z.string(),
          question: z.string(),
          deckName: z.string(),
          modelName: z.string(),
          cardId: z.number(),
          buttons: z.array(z.number()),
          nextReviews: z.array(z.string()),
          fields: z
            .record(
              z.string(),
              z.object({ value: z.string(), order: z.number() }),
            )
            .optional(),
        })
        .nullable(),
      inReview: z.boolean(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Get Current Review Card",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiCurrentCard(@Payload() _args: Record<string, never>) {
    try {
      this.logger.log("Getting current card information from GUI");

      // Call AnkiConnect guiCurrentCard action
      const cardInfo = await this.ankiClient.invoke<GuiCurrentCardInfo | null>(
        "guiCurrentCard",
      );

      if (!cardInfo) {
        this.logger.log("Not currently in review mode");
        return {
          success: true,
          cardInfo: null,
          inReview: false,
          message: "Not currently in review mode",
          hint: "Current card information exists only while a deck is being reviewed in Anki.",
        };
      }

      this.logger.log(
        `Retrieved current card: ${cardInfo.cardId} from deck "${cardInfo.deckName}"`,
      );

      return {
        success: true,
        cardInfo,
        inReview: true,
        message: `Current card: ${cardInfo.cardId} from deck "${cardInfo.deckName}"`,
        hint: "This is the card currently shown in Anki's review window.",
      };
    } catch (error) {
      this.logger.error("Failed to get current card information", error);

      return createErrorResponse(error, {
        hint: "This can happen when Anki is not running or its GUI is not visible",
      });
    }
  }
}
