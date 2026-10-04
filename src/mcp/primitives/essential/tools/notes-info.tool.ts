import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { NoteInfo } from "@/mcp/types/anki.types";

/**
 * Tool for retrieving detailed information about notes
 */
@McpController()
export class NotesInfoTool {
  private readonly logger = new Logger(NotesInfoTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "notesInfo",
    description:
      "Get fields, tags, note type (model) name, card IDs and modification time for each note, by note ID (from findNotes). " +
      "CSS is stored per note type and is not included; modelStyling returns it.",
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
    outputSchema: z.object({
      success: z.boolean(),
      notes: z.array(
        z.object({
          noteId: z.number(),
          modelName: z.string(),
          tags: z.array(z.string()),
          fields: z.record(
            z.string(),
            z.object({ value: z.string(), order: z.number() }),
          ),
          cards: z.array(z.number()),
          mod: z.number().optional(),
        }),
      ),
      count: z.number(),
      notFound: z.number(),
      requestedIds: z.array(z.number()),
      message: z.string(),
      models: z.array(z.string()),
      cssNote: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Get Notes Info",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async notesInfo(@Payload() { notes }: { notes: number[] }) {
    try {
      this.logger.log(`Getting information for ${notes.length} note(s)`);

      // Call AnkiConnect notesInfo action
      const notesData = await this.ankiClient.invoke<any[]>("notesInfo", {
        notes: notes,
      });

      if (!notesData || notesData.length === 0) {
        this.logger.warn("No note information returned");

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

      const message =
        deletedCount > 0
          ? `Retrieved ${validNotes.length} note(s). ${deletedCount} note(s) not found (possibly deleted).`
          : `Successfully retrieved information for ${validNotes.length} note(s)`;

      this.logger.log(message);

      // Get unique model names for CSS awareness info
      const uniqueModels = [...new Set(validNotes.map((n) => n.modelName))];

      return {
        success: true,
        notes: validNotes,
        count: validNotes.length,
        notFound: deletedCount,
        requestedIds: notes,
        message: message,
        models: uniqueModels,
        cssNote: "CSS is stored per note type; modelStyling returns it.",
        hint:
          validNotes.length > 0
            ? "Fields may contain HTML. updateNoteFields modifies content; its changes do not persist for a note that is open in Anki's browser."
            : "No valid notes found. They may have been deleted.",
      };
    } catch (error) {
      this.logger.error("Failed to get notes information", error);

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return createErrorResponse(error, {
            requestedNotes: notes,
            hint: "One or more note IDs are invalid. findNotes returns valid note IDs.",
          });
        }
      }

      return createErrorResponse(error, {
        requestedNotes: notes,
        hint: "This can happen when Anki is not running or the note IDs are invalid",
      });
    }
  }
}
