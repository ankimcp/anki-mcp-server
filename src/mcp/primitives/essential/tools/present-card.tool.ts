import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { AnkiCard, CardPresentation, NoteInfo } from "@/mcp/types/anki.types";
import {
  extractRenderedCardContent,
  getCardType,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving and formatting a single card's data
 */
@McpController()
export class PresentCardTool {
  private readonly logger = new Logger(PresentCardTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "present_card",
    description:
      "Returns a card's rendered front plus its deck, note type, tags and scheduling info. The back is included only when show_answer=true, so a card can be shown to the user before its answer is revealed. Reading a card does not record a review; rate_card does.",
    parameters: z.object({
      card_id: z.number().describe("The ID of the card to retrieve"),
      show_answer: z
        .boolean()
        .default(false)
        .describe("Whether to include the answer/back content in the response"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      card: z.object({
        cardId: z.number(),
        front: z.string(),
        back: z.string().optional(),
        deckName: z.string(),
        modelName: z.string(),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "The note's tags; absent when the note lookup failed after the card was found",
          ),
        currentInterval: z.number(),
        easeFactor: z.number(),
        reviews: z.number(),
        lapses: z.number(),
        cardType: z.string(),
        noteId: z.number(),
      }),
      instruction: z.string(),
    }),
    annotations: {
      title: "Present Card for Review",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async presentCard(
    @Payload()
    { card_id, show_answer }: { card_id: number; show_answer?: boolean },
  ) {
    try {
      const showAnswer = show_answer || false;

      this.logger.log(
        `Retrieving card ${card_id} for presentation (show_answer: ${showAnswer})`,
      );

      // Get detailed card information
      const cardsInfo = await this.ankiClient.invoke<AnkiCard[]>("cardsInfo", {
        cards: [card_id],
      });

      // AnkiConnect returns `{}` (no cardId) for an unknown card ID.
      if (typeof cardsInfo?.[0]?.cardId !== "number") {
        this.logger.warn(`Card not found: ${card_id}`);
        return createErrorResponse(
          new Error(`Card with ID ${card_id} not found`),
          { cardId: card_id },
        );
      }

      const card = cardsInfo[0];
      const { front, back } = extractRenderedCardContent(card);
      const cardType = getCardType(card.type);
      const tags = await this.fetchNoteTags(card.note);

      // Build the presentation object
      const presentation: CardPresentation = {
        cardId: card.cardId,
        front,
        deckName: card.deckName,
        modelName: card.modelName,
        ...(tags !== undefined && { tags }),
        currentInterval: card.interval || 0,
        easeFactor: card.factor || 2500,
        reviews: card.reps || 0,
        lapses: card.lapses || 0,
        cardType,
        noteId: card.note,
      };

      // Only include answer if requested
      if (showAnswer) {
        presentation.back = back;
      }

      this.logger.log(`Retrieved card ${card_id} for presentation`);

      const instruction = !showAnswer
        ? "Question only; the answer is not included. Calling present_card again with show_answer=true returns it."
        : "Answer included. No review has been recorded; rate_card records one with the user's rating (1-4).";

      return {
        success: true,
        card: presentation,
        instruction,
      };
    } catch (error) {
      this.logger.error(`Failed to retrieve card ${card_id}`, error);
      return createErrorResponse(error, { cardId: card_id });
    }
  }

  /**
   * cardsInfo carries no tags; they live on the note. A failed lookup returns
   * undefined so the card is still presented, just without tags.
   */
  private async fetchNoteTags(noteId: number): Promise<string[] | undefined> {
    try {
      const notes = await this.ankiClient.invoke<Partial<NoteInfo>[]>(
        "notesInfo",
        { notes: [noteId] },
      );
      const tags = notes?.[0]?.tags;
      if (Array.isArray(tags)) {
        return tags;
      }
      this.logger.warn(
        `Note ${noteId} not found; presenting card without tags`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to fetch tags for note ${noteId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return undefined;
  }
}
