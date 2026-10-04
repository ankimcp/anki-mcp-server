import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for opening the Add Cards dialog with preset note details
 */
@McpController()
export class GuiAddCardsTool {
  private readonly logger = new Logger(GuiAddCardsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiAddCards",
    description:
      "Opens the Add Cards dialog in the Anki desktop app on the user's screen, pre-filled with deck, note type, fields and tags (replacing an Add Cards dialog that is already open), and makes that deck and note type Anki's current ones. " +
      "Nothing is saved until the user clicks Add, so the returned noteId does not refer to a saved note. " +
      "For when the user wants to review and finish a note by hand in Anki; addNote creates notes directly.",
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
    outputSchema: z.object({
      success: z.boolean(),
      noteId: z.number().nullable(),
      deckName: z.string(),
      modelName: z.string(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Open Add Cards Dialog",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiAddCards(
    @Payload()
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
  ) {
    try {
      this.logger.log(`Opening Add Cards dialog for deck "${note.deckName}"`);

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

      // Call AnkiConnect guiAddCards action
      const noteId = await this.ankiClient.invoke<number | null>(
        "guiAddCards",
        { note },
      );

      this.logger.log(`Add Cards dialog opened, potential note ID: ${noteId}`);

      return {
        success: true,
        noteId,
        deckName: note.deckName,
        modelName: note.modelName,
        message: `Add Cards dialog opened with preset details for deck "${note.deckName}"`,
        hint: "The user can now review and finalize the note in the Anki GUI. The note will be created when they click Add.",
      };
    } catch (error) {
      this.logger.error("Failed to open Add Cards dialog", error);

      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        // Check for field errors first (they may contain "model" in the message)
        if (errorMessage.includes("field")) {
          return createErrorResponse(error, {
            modelName: note.modelName,
            providedFields: Object.keys(note.fields),
            hint: "Field mismatch. modelFieldNames lists the required fields.",
          });
        }
        if (errorMessage.includes("model")) {
          return createErrorResponse(error, {
            modelName: note.modelName,
            hint: "Model not found. modelNames lists the available models.",
          });
        }
        if (errorMessage.includes("deck")) {
          return createErrorResponse(error, {
            deckName: note.deckName,
            hint: "Deck not found. listDecks lists the available decks.",
          });
        }
      }

      return createErrorResponse(error, {
        deckName: note.deckName,
        modelName: note.modelName,
        hint: "This can happen when Anki is not running or the deck/model names are wrong",
      });
    }
  }
}
