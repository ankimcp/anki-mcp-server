import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";
import { NoteInfo } from "@/mcp/types/anki.types";

/**
 * Tool for retrieving detailed information about notes
 */
@Injectable()
export class NotesInfoTool {
  private readonly logger = new Logger(NotesInfoTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "notesInfo",
    description:
      "Get detailed information about specific notes including all fields, tags, model info, and CSS styling. " +
      "Use this after findNotes to get complete note data. Includes CSS for proper rendering awareness.",
    parameters: z.object({
      notes: z
        .array(z.number())
        .min(1)
        .max(100)
        .describe(
          "Array of note IDs to get information for (max 100 at once for performance). " +
            "Get these IDs from findNotes tool.",
        ),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  })
  async notesInfo({ notes }: { notes: number[] }, context: Context) {
    try {
      this.logger.log(`Getting information for ${notes.length} note(s)`);
      await context.reportProgress({ progress: 25, total: 100 });

      // Call AnkiConnect notesInfo action
      const notesData = await this.ankiClient.invoke<any[]>("notesInfo", {
        notes: notes,
      });

      await context.reportProgress({ progress: 75, total: 100 });

      if (!notesData || notesData.length === 0) {
        this.logger.warn("No note information returned");
        await context.reportProgress({ progress: 100, total: 100 });

        return createErrorResponse(new Error("No note information found"), {
          requestedNotes: notes,
          hint: "The note IDs may be invalid or the notes may have been deleted",
        });
      }

      // Transform the data to our NoteInfo format
      const transformedNotes: NoteInfo[] = notesData.map((note) => ({
        noteId: note.noteId,
        modelName: note.modelName,
        tags: note.tags || [],
        fields: note.fields || {},
        cards: note.cards || [],
        mod: note.mod,
      }));

      // Filter out any null results (deleted notes)
      const validNotes = transformedNotes.filter((note) => note.noteId);
      const deletedCount = notes.length - validNotes.length;

      await context.reportProgress({ progress: 100, total: 100 });

      const message =
        deletedCount > 0
          ? `Retrieved ${validNotes.length} note(s). ${deletedCount} note(s) not found (possibly deleted).`
          : `Successfully retrieved information for ${validNotes.length} note(s)`;

      this.logger.log(message);

      // Get unique model names for CSS awareness info
      const uniqueModels = [...new Set(validNotes.map((n) => n.modelName))];

      return createSuccessResponse({
        success: true,
        notes: validNotes,
        count: validNotes.length,
        notFound: deletedCount,
        requestedIds: notes,
        message: message,
        models: uniqueModels,
        cssNote:
          "Each note model has its own CSS styling. Use modelStyling tool to get CSS for specific models.",
        hint:
          validNotes.length > 0
            ? "Fields may contain HTML. Use updateNoteFields to modify content. Do not view notes in Anki browser while updating."
            : "No valid notes found. They may have been deleted.",
      });
    } catch (error) {
      this.logger.error("Failed to get notes information", error);

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return createErrorResponse(error, {
            requestedNotes: notes,
            hint: "One or more note IDs are invalid. Use findNotes to get valid note IDs.",
          });
        }
      }

      return createErrorResponse(error, {
        requestedNotes: notes,
        hint: "Make sure Anki is running and the note IDs are valid",
      });
    }
  }
}
