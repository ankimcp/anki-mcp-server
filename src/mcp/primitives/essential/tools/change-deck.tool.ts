import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { changeDeck } from "./deckActions/actions/changeDeck.action";

@Injectable()
export class ChangeDeckTool {
  private readonly logger = new Logger(ChangeDeckTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "changeDeck",
    description:
      "Move cards to a different deck. Target deck will be created if it doesn't exist.",
    parameters: z.object({
      cards: z.array(z.number()).describe("Array of card IDs to move"),
      deck: z.string().describe("Target deck name"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      cardsAffected: z.number(),
      targetDeck: z.string(),
    }),
    annotations: {
      title: "Move Cards to Deck",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { cards: number[]; deck: string }, context: Context) {
    try {
      this.logger.log(
        `Executing changeDeck: ${params.cards?.length ?? 0} card(s) -> ${params.deck}`,
      );

      if (!params.cards || params.cards.length === 0) {
        throw new Error("cards array is required for changeDeck action");
      }
      if (!params.deck) {
        throw new Error("deck name is required for changeDeck action");
      }

      await context.reportProgress({ progress: 25, total: 100 });

      const result = await changeDeck(
        { cards: params.cards, deck: params.deck },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute changeDeck", error);
      return createErrorResponse(error, {
        action: "changeDeck",
        hint: "Make sure Anki is running and the card IDs / deck name are valid",
      });
    }
  }
}
