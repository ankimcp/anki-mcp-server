import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for opening the Deck Overview dialog for a specific deck
 */
@Injectable()
export class GuiDeckOverviewTool {
  private readonly logger = new Logger(GuiDeckOverviewTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiDeckOverview",
    description:
      "Open Anki Deck Overview dialog for a specific deck. Shows deck statistics and study options. Returns true if succeeded. " +
      "IMPORTANT: Only use when user explicitly requests opening deck overview. " +
      "This tool is for deck management and note organization workflows, NOT for review sessions.",
    parameters: z.object({
      name: z
        .string()
        .min(1)
        .describe("Deck name to open (get from list_decks)"),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  })
  async guiDeckOverview({ name }: { name: string }, context: Context) {
    try {
      this.logger.log(`Opening Deck Overview for deck "${name}"`);
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiDeckOverview action
      const success = await this.ankiClient.invoke<boolean>("guiDeckOverview", {
        name,
      });

      await context.reportProgress({ progress: 100, total: 100 });

      if (!success) {
        this.logger.warn(`Failed to open Deck Overview for deck "${name}"`);
        return createErrorResponse(
          new Error(`Failed to open Deck Overview for deck "${name}"`),
          {
            deckName: name,
            hint: "Deck not found or Anki GUI is not responding. Use list_decks to see available decks.",
          },
        );
      }

      this.logger.log(`Deck Overview opened for deck "${name}"`);

      return createSuccessResponse({
        success: true,
        deckName: name,
        message: `Deck Overview opened for deck "${name}"`,
        hint: "The deck statistics and study options are now visible in the Anki GUI.",
      });
    } catch (error) {
      this.logger.error("Failed to open Deck Overview", error);

      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("invalid")
        ) {
          return createErrorResponse(error, {
            deckName: name,
            hint: "Deck not found. Use list_decks to see available decks.",
          });
        }
      }

      return createErrorResponse(error, {
        deckName: name,
        hint: "Make sure Anki is running and the deck name is correct",
      });
    }
  }
}
