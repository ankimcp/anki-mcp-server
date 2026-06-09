import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for adding a new field to an existing note type
 */
@Injectable()
export class AddModelFieldTool {
  private readonly logger = new Logger(AddModelFieldTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "addModelField",
    description:
      "Add a new field to an existing Anki note type (model). " +
      "The field is appended to the end by default, or inserted at a specific position. " +
      "Existing notes of this type will have the new field set to empty. " +
      "Use modelFieldNames to see current fields before adding.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe('Name of the note type to modify (e.g., "Basic", "Latin Vocabulary")'),
      fieldName: z
        .string()
        .min(1)
        .describe('Name of the new field to add (e.g., "Grammar", "IPA", "Example")'),
      index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Position to insert the field (0-based). Omit to append at the end.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      fieldName: z.string(),
      index: z.number().nullable(),
      message: z.string(),
    }),
    annotations: {
      title: "Add Field to Note Type",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  })
  async addModelField({
    modelName,
    fieldName,
    index,
  }: {
    modelName: string;
    fieldName: string;
    index?: number;
  }) {
    try {
      this.logger.log(
        `Adding field "${fieldName}" to model "${modelName}"${index !== undefined ? ` at index ${index}` : ""}`,
      );

      const params: { modelName: string; fieldName: string; index?: number } =
        { modelName, fieldName };
      if (index !== undefined) {
        params.index = index;
      }

      await this.ankiClient.invoke("modelFieldAdd", params);

      this.logger.log(
        `Successfully added field "${fieldName}" to model "${modelName}"`,
      );

      return {
        success: true,
        modelName,
        fieldName,
        index: index ?? null,
        message:
          index !== undefined
            ? `Successfully added field "${fieldName}" to model "${modelName}" at position ${index}`
            : `Successfully added field "${fieldName}" to model "${modelName}"`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to add field "${fieldName}" to model "${modelName}"`,
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
          fieldName,
          hint: "Model not found. Use modelNames tool to see available models.",
        });
      }

      if (errorMessage.includes("already exist")) {
        return createErrorResponse(error, {
          modelName,
          fieldName,
          hint: `Field "${fieldName}" already exists. Use modelFieldNames to see existing fields.`,
        });
      }

      return createErrorResponse(error, {
        modelName,
        fieldName,
        hint: "Make sure Anki is running and the model name is correct.",
      });
    }
  }
}
