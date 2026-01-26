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
 * Tool for updating fields of existing notes
 */
@Injectable()
export class UpdateNoteFieldsTool {
  private readonly logger = new Logger(UpdateNoteFieldsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "updateNoteFields",
    description:
      "Update the fields of an existing note. Supports HTML content in fields and preserves CSS styling. " +
      "WARNING: Do not view the note in Anki browser while updating, or the fields will not update properly. " +
      "Close the browser or switch to a different note before updating. IMPORTANT: Only update notes that the user explicitly asked to modify.",
    parameters: z.object({
      note: z.object({
        id: z
          .number()
          .describe(
            "The ID of the note to update. Get this from findNotes or notesInfo.",
          ),
        fields: z
          .record(z.string(), z.string())
          .describe(
            "Fields to update with new content. Only include fields you want to change. " +
              'HTML content is supported. Example: {"Front": "<b>New question</b>", "Back": "New answer"}',
          ),
        audio: z
          .array(
            z.object({
              url: z.string().describe("URL of the audio file"),
              filename: z.string().describe("Filename to save as"),
              fields: z.array(z.string()).describe("Fields to add audio to"),
            }),
          )
          .optional()
          .describe("Optional audio files to add to the note"),
        picture: z
          .array(
            z.object({
              url: z.string().describe("URL of the image"),
              filename: z.string().describe("Filename to save as"),
              fields: z.array(z.string()).describe("Fields to add image to"),
            }),
          )
          .optional()
          .describe("Optional images to add to the note"),
      }),
    }),
  })
  async updateNoteFields(
    {
      note,
    }: {
      note: {
        id: number;
        fields: Record<string, string>;
        audio?: Array<{
          url: string;
          filename: string;
          fields: string[];
        }>;
        picture?: Array<{
          url: string;
          filename: string;
          fields: string[];
        }>;
      };
    },
    context: Context,
  ) {
    try {
      const fieldCount = Object.keys(note.fields).length;
      this.logger.log(
        `Updating ${fieldCount} field(s) for note ID: ${note.id}`,
      );

      // Validate that at least one field is being updated
      if (fieldCount === 0) {
        return createErrorResponse(new Error("No fields provided for update"), {
          noteId: note.id,
          hint: "Provide at least one field to update",
        });
      }

      await context.reportProgress({ progress: 25, total: 100 });

      // First, let's get the current note info to validate it exists
      const notesInfo = await this.ankiClient.invoke<any[]>("notesInfo", {
        notes: [note.id],
      });

      if (!notesInfo || notesInfo.length === 0 || !notesInfo[0]) {
        return createErrorResponse(new Error("Note not found"), {
          noteId: note.id,
          hint: "The note ID is invalid or the note has been deleted. Use findNotes to get valid note IDs.",
        });
      }

      const currentNote = notesInfo[0];
      const modelName = currentNote.modelName;
      const existingFields = Object.keys(currentNote.fields);

      // Validate that all provided fields exist in the model
      const invalidFields = Object.keys(note.fields).filter(
        (field) => !existingFields.includes(field),
      );

      if (invalidFields.length > 0) {
        return createErrorResponse(
          new Error(`Invalid fields for model "${modelName}"`),
          {
            noteId: note.id,
            modelName,
            invalidFields,
            validFields: existingFields,
            hint: `These fields don't exist in the "${modelName}" model. Use modelFieldNames to see valid fields.`,
          },
        );
      }

      await context.reportProgress({ progress: 50, total: 100 });

      // Build the update parameters
      const updateParams: any = {
        note: {
          id: note.id,
          fields: note.fields,
        },
      };

      // Add media if provided
      if (note.audio) {
        updateParams.note.audio = note.audio;
      }
      if (note.picture) {
        updateParams.note.picture = note.picture;
      }

      // Call AnkiConnect updateNoteFields action
      await this.ankiClient.invoke<null>("updateNoteFields", updateParams);

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(`Successfully updated note ID: ${note.id}`);

      // Get the list of updated fields for the response
      const updatedFields = Object.keys(note.fields);

      return createSuccessResponse({
        success: true,
        noteId: note.id,
        updatedFields,
        fieldCount,
        modelName,
        message: `Successfully updated ${fieldCount} field${fieldCount === 1 ? "" : "s"} in note`,
        cssNote:
          "HTML content is preserved. Model CSS styling remains unchanged.",
        warning:
          "If changes don't appear, ensure the note wasn't open in Anki browser during update.",
        hint: "Use notesInfo to verify the changes or findNotes to locate other notes to update.",
      });
    } catch (error) {
      this.logger.error("Failed to update note fields", error);

      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          return createErrorResponse(error, {
            noteId: note.id,
            hint: "Note not found. It may have been deleted.",
          });
        }
        if (error.message.includes("field")) {
          return createErrorResponse(error, {
            noteId: note.id,
            providedFields: Object.keys(note.fields),
            hint: "Check field names match exactly (case-sensitive). Use notesInfo to see current fields.",
          });
        }
      }

      return createErrorResponse(error, {
        noteId: note.id,
        hint: "Make sure Anki is running and the note is not open in the browser",
      });
    }
  }
}
