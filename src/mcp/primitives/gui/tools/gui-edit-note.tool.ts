import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for opening the note editor for a specific note
 */
@McpController()
export class GuiEditNoteTool {
  private readonly logger = new Logger(GuiEditNoteTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiEditNote",
    description:
      "Opens the note editor window in the Anki desktop app on the user's screen for one note, where the user can edit its fields and tags by hand. " +
      "The tool itself changes no note content. For when the user wants to edit a note in Anki; updateNoteFields edits fields directly.",
    parameters: z.object({
      note: z
        .number()
        .positive()
        .describe("Note ID to edit (get from findNotes or notesInfo)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      noteId: z.number(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Open Note Editor",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiEditNote(@Payload() { note }: { note: number }) {
    try {
      this.logger.log(`Opening note editor for note ${note}`);

      // Call AnkiConnect guiEditNote action
      await this.ankiClient.invoke<null>("guiEditNote", { note });

      this.logger.log(`Note editor opened for note ${note}`);

      return {
        success: true,
        noteId: note,
        message: `Note editor opened for note ${note}`,
        hint: "The user can now edit the note fields, tags, and cards in the Anki GUI. Changes will be saved when they close the editor.",
      };
    } catch (error) {
      this.logger.error("Failed to open note editor", error);

      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("invalid")
        ) {
          return createErrorResponse(error, {
            noteId: note,
            hint: "Note not found. findNotes searches for notes and returns valid note IDs.",
          });
        }
      }

      return createErrorResponse(error, {
        noteId: note,
        hint: "This can happen when Anki is not running or the note ID is invalid",
      });
    }
  }
}
