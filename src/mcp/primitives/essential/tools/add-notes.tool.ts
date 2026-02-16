import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import {
  AnkiConnectClient,
  ReadOnlyModeError,
} from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/** Per-note result status */
type NoteResultStatus = "created" | "skipped" | "failed";

/** Result for a single note in the batch */
interface NoteResult {
  index: number;
  status: NoteResultStatus;
  noteId?: number;
  reason?: string;
  error?: string;
}

/**
 * Tool for adding multiple notes to Anki in a single batch.
 * Uses sequential addNote calls internally to support partial success.
 */
@Injectable()
export class AddNotesTool {
  private readonly logger = new Logger(AddNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "addNotes",
    description:
      "Add multiple notes to Anki in a single batch. Up to 100 notes sharing the same deck and model. Supports partial success - individual failures don't affect others. IMPORTANT: Only create notes that were explicitly requested by the user.",
    parameters: z.object({
      deckName: z.string().min(1).describe("The deck to add all notes to"),
      modelName: z
        .string()
        .min(1)
        .describe('The note type/model for all notes (e.g., "Basic", "Cloze")'),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags applied to all notes (merged with per-note tags)"),
      allowDuplicate: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to allow adding duplicate notes"),
      duplicateScope: z
        .enum(["deck", "collection"])
        .optional()
        .describe("Scope for duplicate checking"),
      notes: z
        .array(
          z.object({
            fields: z
              .record(z.string(), z.string())
              .describe(
                'Field values as key-value pairs (e.g., {"Front": "question", "Back": "answer"})',
              ),
            tags: z
              .array(z.string())
              .optional()
              .describe(
                "Additional tags for this specific note (merged with shared tags)",
              ),
          }),
        )
        .min(1)
        .max(100)
        .describe("Array of notes to create (1-100)"),
    }),
  })
  async addNotes(
    {
      deckName,
      modelName,
      tags: sharedTags,
      allowDuplicate,
      duplicateScope,
      notes,
    }: {
      deckName: string;
      modelName: string;
      tags?: string[];
      allowDuplicate?: boolean;
      duplicateScope?: "deck" | "collection";
      notes: Array<{
        fields: Record<string, string>;
        tags?: string[];
      }>;
    },
    context: Context,
  ) {
    try {
      this.logger.log(
        `Adding ${notes.length} notes to deck "${deckName}" with model "${modelName}"`,
      );

      const totalSteps = notes.length + 2; // +2 for validation steps
      let currentStep = 0;

      // 1. Validate model and get field names (single call)
      await context.reportProgress({
        progress: currentStep,
        total: totalSteps,
      });

      const fieldNames = await this.ankiClient.invoke<string[] | null>(
        "modelFieldNames",
        { modelName },
      );

      if (!fieldNames || fieldNames.length === 0) {
        return createErrorResponse(
          new Error(`Model "${modelName}" not found or has no fields`),
          {
            deckName,
            modelName,
            totalRequested: notes.length,
            hint: "Use modelNames tool to see available models",
          },
        );
      }

      currentStep++;
      await context.reportProgress({
        progress: currentStep,
        total: totalSteps,
      });

      // 2. Validate sort fields (first field must be non-empty for all notes)
      const sortField = fieldNames[0];
      const sortFieldErrors: Array<{ index: number; error: string }> = [];

      for (let i = 0; i < notes.length; i++) {
        const sortFieldValue = notes[i].fields[sortField];
        if (!sortFieldValue || sortFieldValue.trim() === "") {
          sortFieldErrors.push({
            index: i,
            error: `The first field "${sortField}" cannot be empty. Anki requires the sort field to have content.`,
          });
        }
      }

      if (sortFieldErrors.length > 0) {
        return createErrorResponse(
          new Error(
            `${sortFieldErrors.length} note(s) have empty sort field "${sortField}"`,
          ),
          {
            deckName,
            modelName,
            totalRequested: notes.length,
            invalidNotes: sortFieldErrors,
            hint: `The first field "${sortField}" is the sort field and must contain non-empty content for every note.`,
          },
        );
      }

      currentStep++;
      await context.reportProgress({
        progress: currentStep,
        total: totalSteps,
      });

      // 3. Sequential loop: call addNote per note
      const results: NoteResult[] = [];
      let createdCount = 0;
      let skippedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];

        // Merge tags: shared + per-note, deduplicated
        const mergedTags = [
          ...new Set([...(sharedTags ?? []), ...(note.tags ?? [])]),
        ];

        // Build note params
        const noteParams: Record<string, unknown> = {
          deckName,
          modelName,
          fields: note.fields,
        };

        if (mergedTags.length > 0) {
          noteParams.tags = mergedTags;
        }

        // Build options
        const options: Record<string, unknown> = {};
        let hasOptions = false;

        if (allowDuplicate !== undefined) {
          options.allowDuplicate = allowDuplicate;
          hasOptions = true;
        }

        if (duplicateScope !== undefined) {
          options.duplicateScope = duplicateScope;
          hasOptions = true;
        }

        if (hasOptions) {
          noteParams.options = options;
        }

        try {
          const noteId = await this.ankiClient.invoke<number | null>(
            "addNote",
            { note: noteParams },
          );

          if (noteId != null) {
            results.push({ index: i, status: "created", noteId });
            createdCount++;
          } else {
            results.push({ index: i, status: "skipped", reason: "duplicate" });
            skippedCount++;
          }
        } catch (error) {
          // Let ReadOnlyModeError bubble up as a batch-level error
          if (error instanceof ReadOnlyModeError) {
            throw error;
          }

          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Detect duplicates from error messages
          if (
            errorMessage.includes("duplicate") ||
            errorMessage.includes(
              "cannot create note because it is a duplicate",
            )
          ) {
            results.push({ index: i, status: "skipped", reason: "duplicate" });
            skippedCount++;
          } else {
            results.push({ index: i, status: "failed", error: errorMessage });
            failedCount++;
          }
        }

        currentStep++;
        await context.reportProgress({
          progress: currentStep,
          total: totalSteps,
        });
      }

      this.logger.log(
        `Batch complete: ${createdCount} created, ${skippedCount} skipped, ${failedCount} failed`,
      );

      const response = {
        success: createdCount > 0 || (failedCount === 0 && skippedCount > 0),
        deckName,
        modelName,
        totalRequested: notes.length,
        created: createdCount,
        skipped: skippedCount,
        failed: failedCount,
        results,
      };

      return createSuccessResponse(response);
    } catch (error) {
      this.logger.error("Failed to add notes batch", error);

      return createErrorResponse(error, {
        deckName,
        modelName,
        totalRequested: notes.length,
        hint: "Make sure Anki is running and the deck/model names are correct",
      });
    }
  }
}
