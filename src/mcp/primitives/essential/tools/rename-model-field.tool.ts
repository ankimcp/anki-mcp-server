import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for renaming a field in an existing note type
 */
@Injectable()
export class RenameModelFieldTool {
  private readonly logger = new Logger(RenameModelFieldTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "renameModelField",
    description:
      "Rename a field in an existing Anki note type (model). " +
      "Card templates that reference the old field name (e.g., {{OldName}}) will need to be " +
      "updated separately using updateModelTemplates — they are not updated automatically. " +
      "Use modelFieldNames to confirm the current field name before renaming.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe('Name of the note type to modify (e.g., "Basic", "Latin Vocabulary")'),
      oldFieldName: z
        .string()
        .min(1)
        .describe('Current name of the field to rename (e.g., "Notes")'),
      newFieldName: z
        .string()
        .min(1)
        .describe('New name for the field (e.g., "Grammar Notes")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      oldFieldName: z.string(),
      newFieldName: z.string(),
      message: z.string(),
      warning: z.string().optional(),
    }),
    annotations: {
      title: "Rename Field in Note Type",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  })
  async renameModelField({
    modelName,
    oldFieldName,
    newFieldName,
  }: {
    modelName: string;
    oldFieldName: string;
    newFieldName: string;
  }) {
    try {
      this.logger.log(
        `Renaming field "${oldFieldName}" → "${newFieldName}" in model "${modelName}"`,
      );

      await this.ankiClient.invoke("modelFieldRename", {
        modelName,
        oldFieldName,
        newFieldName,
      });

      this.logger.log(
        `Successfully renamed field "${oldFieldName}" to "${newFieldName}" in model "${modelName}"`,
      );

      return {
        success: true,
        modelName,
        oldFieldName,
        newFieldName,
        message: `Successfully renamed field "${oldFieldName}" to "${newFieldName}" in model "${modelName}"`,
        warning:
          `Card templates referencing "{{${oldFieldName}}}" must be updated manually ` +
          `to "{{${newFieldName}}}" using the updateModelTemplates tool.`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to rename field "${oldFieldName}" in model "${modelName}"`,
        error,
      );

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist")
      ) {
        return createErrorResponse(error, {
          modelName,
          oldFieldName,
          newFieldName,
          hint: "Model or field not found. Use modelNames and modelFieldNames tools to verify names.",
        });
      }

      if (errorMessage.includes("already exist")) {
        return createErrorResponse(error, {
          modelName,
          oldFieldName,
          newFieldName,
          hint: `A field named "${newFieldName}" already exists in this model.`,
        });
      }

      return createErrorResponse(error, {
        modelName,
        oldFieldName,
        newFieldName,
        hint: "Make sure Anki is running and the model and field names are correct.",
      });
    }
  }
}
