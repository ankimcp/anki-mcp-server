import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { createDeck } from "./deckActions/actions/createDeck.action";

@Injectable()
export class CreateDeckTool {
  private readonly logger = new Logger(CreateDeckTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "createDeck",
    description:
      'Create a new empty Anki deck. Use "::" for parent::child structure (max 2 levels, e.g., "Japanese::JLPT N5"). Will not overwrite existing decks.',
    parameters: z.object({
      deckName: z
        .string()
        .describe(
          'The name of the deck to create. Use "::" for parent::child structure (max 2 levels)',
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      deckId: z.number().optional(),
      deckName: z.string(),
      message: z.string(),
      created: z.boolean(),
      exists: z.boolean().optional(),
      parentDeck: z.string().optional(),
      childDeck: z.string().optional(),
      parentExisted: z.boolean().optional(),
    }),
    annotations: {
      title: "Create Deck",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { deckName: string }, context: Context) {
    try {
      this.logger.log(`Executing createDeck: ${params.deckName}`);
      await context.reportProgress({ progress: 25, total: 100 });

      const result = await createDeck(
        { deckName: params.deckName },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute createDeck", error);
      return createErrorResponse(error, {
        action: "createDeck",
        hint: "Make sure Anki is running and the deck name is valid",
      });
    }
  }
}
