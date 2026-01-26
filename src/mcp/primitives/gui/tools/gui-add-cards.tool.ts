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
 * Tool for opening the Add Cards dialog with preset note details
 */
@Injectable()
export class GuiAddCardsTool {
  private readonly logger = new Logger(GuiAddCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiAddCards",
    description:
      "Open Anki Add Cards dialog with preset note details (deck, model, fields, tags). Returns potential note ID. " +
      "IMPORTANT: Only use when user explicitly requests opening the Add Cards dialog. " +
      "This tool is for note editing/creation workflows. Use this when user wants to manually review and finalize note creation in the GUI.",
    parameters: z.object({
      note: z.object({
        deckName: z.string().min(1).describe("Deck to add the note to"),
        modelName: z
          .string()
          .min(1)
          .describe('Note type/model (e.g., "Basic", "Cloze")'),
        fields: z
          .record(z.string(), z.string())
          .describe(
            'Field values to pre-fill (e.g., {"Front": "question", "Back": "answer"})',
          ),
        tags: z.array(z.string()).optional().describe("Optional tags to add"),
      }),
    }),
  })
  async guiAddCards(
    {
      note,
    }: {
      note: {
        deckName: string;
        modelName: string;
        fields: Record<string, string>;
        tags?: string[];
      };
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Opening Add Cards dialog for deck "${note.deckName}"`);
      await context.reportProgress({ progress: 25, total: 100 });

      // Validate fields are not empty
      const emptyFields = Object.entries(note.fields).filter(
        ([_, value]) => !value || value.trim() === "",
      );
      if (emptyFields.length > 0) {
        return createErrorResponse(
          new Error(
            `Fields cannot be empty: ${emptyFields.map(([key]) => key).join(", ")}`,
          ),
          {
            deckName: note.deckName,
            modelName: note.modelName,
            emptyFields: emptyFields.map(([key]) => key),
          },
        );
      }

      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiAddCards action
      const noteId = await this.ankiClient.invoke<number | null>(
        "guiAddCards",
        { note },
      );

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(`Add Cards dialog opened, potential note ID: ${noteId}`);

      return createSuccessResponse({
        success: true,
        noteId,
        deckName: note.deckName,
        modelName: note.modelName,
        message: `Add Cards dialog opened with preset details for deck "${note.deckName}"`,
        hint: "The user can now review and finalize the note in the Anki GUI. The note will be created when they click Add.",
      });
    } catch (error) {
      this.logger.error("Failed to open Add Cards dialog", error);

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        // Check for field errors first (they may contain "model" in the message)
        if (errorMessage.includes("field")) {
          return createErrorResponse(error, {
            modelName: note.modelName,
            providedFields: Object.keys(note.fields),
            hint: "Field mismatch. Use modelFieldNames tool to see required fields.",
          });
        }
        if (errorMessage.includes("model")) {
          return createErrorResponse(error, {
            modelName: note.modelName,
            hint: "Model not found. Use modelNames tool to see available models.",
          });
        }
        if (errorMessage.includes("deck")) {
          return createErrorResponse(error, {
            deckName: note.deckName,
            hint: "Deck not found. Use list_decks tool to see available decks.",
          });
        }
      }

      return createErrorResponse(error, {
        deckName: note.deckName,
        modelName: note.modelName,
        hint: "Make sure Anki is running and the deck/model names are correct",
      });
    }
  }
}
