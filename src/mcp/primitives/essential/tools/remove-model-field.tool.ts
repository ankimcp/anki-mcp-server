import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for removing a field from an existing note type
 */
@Injectable()
export class RemoveModelFieldTool {
  private readonly logger = new Logger(RemoveModelFieldTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "removeModelField",
    description:
      "Remove a field from an existing Anki note type (model). " +
      "WARNING: All data stored in this field across every note of this type will be permanently deleted. " +
      "Use modelFieldNames to confirm the field name before removing.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe(
          'Name of the note type to modify (e.g., "Basic", "Latin Vocabulary")',
        ),
      fieldName: z
        .string()
        .min(1)
        .describe('Name of the field to remove (e.g., "Grammar", "IPA")'),
      confirmDeletion: z
        .boolean()
        .describe(
          "Must be set to true to confirm you understand all field data will be permanently deleted.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      fieldName: z.string(),
      message: z.string(),
    }),
    annotations: {
      title: "Remove Field from Note Type",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  })
  async removeModelField({
    modelName,
    fieldName,
    confirmDeletion,
  }: {
    modelName: string;
    fieldName: string;
    confirmDeletion: boolean;
  }) {
    try {
      if (!confirmDeletion) {
        return createErrorResponse(new Error("Deletion not confirmed"), {
          modelName,
          fieldName,
          hint: "Set confirmDeletion: true to confirm you want to permanently delete this field and all its data.",
        });
      }

      this.logger.log(
        `Removing field "${fieldName}" from model "${modelName}"`,
      );

      await this.ankiClient.invoke("modelFieldRemove", {
        modelName,
        fieldName,
      });

      this.logger.log(
        `Successfully removed field "${fieldName}" from model "${modelName}"`,
      );

      return {
        success: true,
        modelName,
        fieldName,
        message: `Successfully removed field "${fieldName}" from model "${modelName}". All data in this field has been deleted.`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to remove field "${fieldName}" from model "${modelName}"`,
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
          hint: "Model or field not found. Use modelNames and modelFieldNames tools to verify names.",
        });
      }

      return createErrorResponse(error, {
        modelName,
        fieldName,
        hint: "Make sure Anki is running and the model and field names are correct.",
      });
    }
  }
}
