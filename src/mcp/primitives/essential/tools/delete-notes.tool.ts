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
 * Tool for deleting notes and their associated cards
 */
@Injectable()
export class DeleteNotesTool {
  private readonly logger = new Logger(DeleteNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deleteNotes",
    description:
      "Delete notes by their IDs. This will permanently remove the notes and ALL associated cards. " +
      "This action cannot be undone unless you have a backup. CRITICAL: This is destructive and permanent - only delete notes the user explicitly confirmed for deletion.",
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
          "Must be set to true to confirm you want to permanently delete these notes and their cards",
        ),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  })
  async deleteNotes(
    { notes, confirmDeletion }: { notes: number[]; confirmDeletion: boolean },
    context: Context,
  ) {
    try {
      // Safety check - require explicit confirmation
      if (!confirmDeletion) {
        return createErrorResponse(new Error("Deletion not confirmed"), {
          requestedNotes: notes,
          noteCount: notes.length,
          hint: "Set confirmDeletion to true to permanently delete these notes and all their cards",
          warning: "This action cannot be undone!",
        });
      }

      this.logger.log(`Deleting ${notes.length} note(s)`);
      await context.reportProgress({ progress: 25, total: 100 });

      // First, get info about the notes to be deleted (for logging and confirmation)
      const notesInfo = await this.ankiClient.invoke<any[]>("notesInfo", {
        notes: notes,
      });

      const validNotes = notesInfo.filter((note) => note && note.noteId);
      const validNoteIds = validNotes.map((note) => note.noteId);
      const notFoundCount = notes.length - validNotes.length;

      if (validNoteIds.length === 0) {
        this.logger.warn("No valid notes found to delete");
        await context.reportProgress({ progress: 100, total: 100 });

        return createSuccessResponse({
          success: true,
          deletedCount: 0,
          notFoundCount: notes.length,
          requestedIds: notes,
          message:
            "No notes were deleted (none of the provided IDs were valid)",
          hint: "The notes may have already been deleted or the IDs are invalid",
        });
      }

      // Count total cards that will be deleted
      const totalCards = validNotes.reduce(
        (sum, note) => sum + (note.cards?.length || 0),
        0,
      );

      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect deleteNotes action
      await this.ankiClient.invoke<null>("deleteNotes", {
        notes: validNoteIds,
      });

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s)`,
      );

      const message =
        notFoundCount > 0
          ? `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s). ${notFoundCount} note(s) were not found.`
          : `Successfully deleted ${validNoteIds.length} note(s) and ${totalCards} card(s)`;

      return createSuccessResponse({
        success: true,
        deletedCount: validNoteIds.length,
        deletedNoteIds: validNoteIds,
        cardsDeleted: totalCards,
        notFoundCount,
        requestedIds: notes,
        message: message,
        warning: "These notes and cards have been permanently deleted",
        hint: "Consider syncing with AnkiWeb to propagate deletions to other devices",
      });
    } catch (error) {
      this.logger.error("Failed to delete notes", error);

      if (error instanceof Error) {
        if (error.message.includes("permission")) {
          return createErrorResponse(error, {
            requestedNotes: notes,
            hint: "Permission denied. Check if Anki allows deletions via AnkiConnect.",
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
