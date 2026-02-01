import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { NoteOptions } from "@/mcp/types/anki.types";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for adding new notes to Anki
 */
@Injectable()
export class AddNoteTool {
  private readonly logger = new Logger(AddNoteTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "addNote",
    description:
      "Add a new note to Anki. Use modelNames to see available note types and modelFieldNames to see required fields. Returns the note ID on success. IMPORTANT: Only create notes that were explicitly requested by the user.",
    parameters: z.object({
      deckName: z.string().min(1).describe("The deck to add the note to"),
      modelName: z
        .string()
        .min(1)
        .describe('The note type/model to use (e.g., "Basic", "Cloze")'),
      fields: z
        .record(z.string(), z.string())
        .describe(
          'Field values as key-value pairs (e.g., {"Front": "question", "Back": "answer"})',
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to add to the note"),
      allowDuplicate: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether to allow adding duplicate notes"),
      duplicateScope: z
        .enum(["deck", "collection"])
        .optional()
        .describe("Scope for duplicate checking"),
      duplicateScopeOptions: z
        .object({
          deckName: z
            .string()
            .optional()
            .describe("Specific deck to check for duplicates"),
          checkChildren: z
            .boolean()
            .optional()
            .default(false)
            .describe("Check child decks for duplicates"),
          checkAllModels: z
            .boolean()
            .optional()
            .default(false)
            .describe("Check across all note types"),
        })
        .optional()
        .describe("Advanced duplicate checking options"),
    }),
  })
  async addNote(
    {
      deckName,
      modelName,
      fields,
      tags,
      allowDuplicate,
      duplicateScope,
      duplicateScopeOptions,
    }: {
      deckName: string;
      modelName: string;
      fields: Record<string, string>;
      tags?: string[];
      allowDuplicate?: boolean;
      duplicateScope?: "deck" | "collection";
      duplicateScopeOptions?: {
        deckName?: string;
        checkChildren?: boolean;
        checkAllModels?: boolean;
      };
    },
    context: Context,
  ) {
    try {
      this.logger.log(
        `Adding note to deck "${deckName}" with model "${modelName}"`,
      );
      await context.reportProgress({ progress: 20, total: 100 });

      // Get the field names for the model to determine the sort field (first field)
      const fieldNames = await this.ankiClient.invoke<string[]>(
        "modelFieldNames",
        {
          modelName: modelName,
        },
      );

      if (!fieldNames || fieldNames.length === 0) {
        return createErrorResponse(
          new Error(`Model "${modelName}" not found or has no fields`),
          {
            modelName,
            hint: "Use modelNames tool to see available models",
          },
        );
      }

      await context.reportProgress({ progress: 35, total: 100 });

      // Validate that the first field (sort field) is non-empty
      const sortField = fieldNames[0];
      const sortFieldValue = fields[sortField];

      if (!sortFieldValue || sortFieldValue.trim() === "") {
        return createErrorResponse(
          new Error(
            `The first field "${sortField}" cannot be empty. Anki requires the sort field to have content.`,
          ),
          {
            modelName,
            sortField,
            providedFields: Object.keys(fields),
            hint: `The first field "${sortField}" is the sort field and must contain non-empty content.`,
          },
        );
      }

      await context.reportProgress({ progress: 50, total: 100 });

      // Build the note parameters for AnkiConnect
      const noteParams: any = {
        deckName: deckName,
        modelName: modelName,
        fields: fields,
      };

      // Add tags if provided
      if (tags && tags.length > 0) {
        noteParams.tags = tags;
      }

      // Build options if any duplicate settings are provided
      const options: NoteOptions = {};
      let hasOptions = false;

      if (allowDuplicate !== undefined) {
        options.allowDuplicate = allowDuplicate;
        hasOptions = true;
      }

      if (duplicateScope !== undefined) {
        options.duplicateScope = duplicateScope;
        hasOptions = true;
      }

      if (duplicateScopeOptions !== undefined) {
        options.duplicateScopeOptions = duplicateScopeOptions;
        hasOptions = true;
      }

      if (hasOptions) {
        noteParams.options = options;
      }

      await context.reportProgress({ progress: 60, total: 100 });

      // Add the note using AnkiConnect
      const noteId = await this.ankiClient.invoke<number | null>("addNote", {
        note: noteParams,
      });

      await context.reportProgress({ progress: 80, total: 100 });

      if (!noteId) {
        this.logger.warn("Note creation failed - possibly a duplicate");
        await context.reportProgress({ progress: 100, total: 100 });

        return createErrorResponse(
          new Error("Failed to create note - it may be a duplicate"),
          {
            deckName,
            modelName,
            hint: allowDuplicate
              ? "The note could not be created. Check if the model and deck names are correct."
              : "The note appears to be a duplicate. Set allowDuplicate to true if you want to add it anyway.",
          },
        );
      }

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(`Successfully created note with ID: ${noteId}`);

      const fieldCount = Object.keys(fields).length;
      const tagCount = tags ? tags.length : 0;

      return createSuccessResponse({
        success: true,
        noteId: noteId,
        deckName: deckName,
        modelName: modelName,
        message: `Successfully created note in deck "${deckName}"`,
        details: {
          fieldsAdded: fieldCount,
          tagsAdded: tagCount,
          duplicateCheckScope: duplicateScope || "default",
        },
      });
    } catch (error) {
      this.logger.error("Failed to add note", error);

      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes("model")) {
          return createErrorResponse(error, {
            deckName,
            modelName,
            hint: "Model not found. Use modelNames tool to see available models.",
          });
        }
        if (error.message.includes("deck")) {
          return createErrorResponse(error, {
            deckName,
            modelName,
            hint: "Deck not found. Use list_decks tool to see available decks or createDeck to create a new one.",
          });
        }
        if (error.message.includes("field")) {
          return createErrorResponse(error, {
            deckName,
            modelName,
            providedFields: Object.keys(fields),
            hint: "Field mismatch. Use modelFieldNames tool to see required fields for this model.",
          });
        }
      }

      return createErrorResponse(error, {
        deckName,
        modelName,
        hint: "Make sure Anki is running and the deck/model names are correct",
      });
    }
  }
}
