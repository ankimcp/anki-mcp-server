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
 * Tool for opening the note editor for a specific note
 */
@Injectable()
export class GuiEditNoteTool {
  private readonly logger = new Logger(GuiEditNoteTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiEditNote",
    description:
      "Open Anki note editor dialog for a specific note ID. Allows manual editing of note fields, tags, and cards in the GUI. " +
      "IMPORTANT: Only use when user explicitly requests editing a note via GUI. " +
      "This tool is for note editing workflows when user wants to manually edit in Anki interface. " +
      "For programmatic editing, use updateNoteFields instead.",
    parameters: z.object({
      note: z
        .number()
        .positive()
        .describe("Note ID to edit (get from findNotes or notesInfo)"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  })
  async guiEditNote({ note }: { note: number }, context: Context) {
    try {
      this.logger.log(`Opening note editor for note ${note}`);
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiEditNote action
      await this.ankiClient.invoke<null>("guiEditNote", { note });

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(`Note editor opened for note ${note}`);

      return createSuccessResponse({
        success: true,
        noteId: note,
        message: `Note editor opened for note ${note}`,
        hint: "The user can now edit the note fields, tags, and cards in the Anki GUI. Changes will be saved when they close the editor.",
      });
    } catch (error) {
      this.logger.error("Failed to open note editor", error);

      if (error instanceof Error) {
        if (
          error.message.includes("not found") ||
          error.message.includes("invalid")
        ) {
          return createErrorResponse(error, {
            noteId: note,
            hint: "Note not found. Use findNotes to search for notes and get valid note IDs.",
          });
        }
      }

      return createErrorResponse(error, {
        noteId: note,
        hint: "Make sure Anki is running and the note ID is valid",
      });
    }
  }
}
