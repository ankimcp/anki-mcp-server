import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for deleting notes and their associated cards
 */
@McpController()
export class DeleteNotesTool {
  private readonly logger = new Logger(DeleteNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deleteNotes",
    description:
      "Delete notes by their IDs. Permanently removes the notes and ALL their cards, including the cards' scheduling. " +
      "Anki's undo history (Edit > Undo, or guiUndo, which reverts the newest step) can restore them until that history is cleared, for example by a change Anki does not record for undo such as updateNoteFields; after that only a backup restores them. " +
      "The call is rejected unless confirmDeletion is true.",
    parameters: z.object({
      notes: z
        .array(z.number())
        .min(1)
        .max(100)
        .describe(
          "Array of note IDs to delete (max 100 at once for safety). " +
            "Get these IDs from findNotes tool. ALL cards associated with these notes will be deleted.",
        ),
      confirmDeletion: z
        .boolean()
        .describe(
          "Confirms the permanent deletion of these notes and their cards; the call is rejected unless this is true",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      deletedCount: z.number(),
      deletedNoteIds: z.array(z.number()).optional(),
      cardsDeleted: z.number().optional(),
      notFoundCount: z.number(),
      requestedIds: z.array(z.number()),
      message: z.string(),
      warning: z.string().optional(),
      hint: z.string().optional(),
    }),
    annotations: {
      title: "Delete Notes",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async deleteNotes(
    @Payload()
    { notes, confirmDeletion }: { notes: number[]; confirmDeletion: boolean },
  ) {
    try {
      // Safety check - require explicit confirmation
      if (!confirmDeletion) {
        return createErrorResponse(new Error("Deletion not confirmed"), {
          requestedNotes: notes,
          noteCount: notes.length,
          hint: "Deletion runs only when confirmDeletion is true; it permanently deletes these notes and all their cards",
          warning:
            "Deleting permanently removes these notes and all their cards from the collection",
        });
      }

      this.logger.log(`Deleting ${notes.length} note(s)`);

      // First, get info about the notes to be deleted (for logging and confirmation)
      const notesInfo = await this.ankiClient.invoke<any[]>("notesInfo", {
        notes: notes,
      });

      const validNotes = notesInfo.filter((note) => note && note.noteId);
      const validNoteIds = validNotes.map((note) => note.noteId);
      const notFoundCount = notes.length - validNotes.length;

      if (validNoteIds.length === 0) {
        this.logger.warn("No valid notes found to delete");

        return {
          success: true,
          deletedCount: 0,
          notFoundCount: notes.length,
          requestedIds: notes,
          message:
            "No notes were deleted (none of the provided IDs were valid)",
          hint: "The notes may have already been deleted or the IDs are invalid",
        };
      }

      // Count total cards that will be deleted
      const totalCards = validNotes.reduce(
        (sum, note) => sum + (note.cards?.length || 0),
        0,
      );

      // Call AnkiConnect deleteNotes action
      await this.ankiClient.invoke<null>("deleteNotes", {
        notes: validNoteIds,
      });

      this.logger.log(
        `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s)`,
      );

      const message =
        notFoundCount > 0
          ? `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s). ${notFoundCount} note(s) were not found.`
          : `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s)`;

      return {
        success: true,
        deletedCount: validNoteIds.length,
        deletedNoteIds: validNoteIds,
        cardsDeleted: totalCards,
        notFoundCount,
        requestedIds: notes,
        message: message,
        warning: "These notes and cards have been permanently deleted",
        hint: "Other devices see the deletions after the collection is synced with AnkiWeb",
      };
    } catch (error) {
      this.logger.error("Failed to delete notes", error);

      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          return createErrorResponse(error, {
            requestedNotes: notes,
            hint: "Permission denied. AnkiConnect's configuration in Anki may not allow deletions.",
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
