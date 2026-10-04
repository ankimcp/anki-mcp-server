import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for removing a field from an existing note type
 */
@McpController()
export class RemoveModelFieldTool {
  private readonly logger = new Logger(RemoveModelFieldTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "removeModelField",
    description:
      "Remove a field from an existing Anki note type (model). " +
      "All data stored in this field across every note of this type is permanently deleted. " +
      "The call is rejected unless confirmDeletion is true. modelFieldNames lists the current field names.",
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
          "Confirms that all data in this field will be permanently deleted; the call is rejected unless this is true.",
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
      openWorldHint: false,
    },
  })
  async removeModelField(
    @Payload()
    {
      modelName,
      fieldName,
      confirmDeletion,
    }: {
      modelName: string;
      fieldName: string;
      confirmDeletion: boolean;
    },
  ) {
    try {
      if (!confirmDeletion) {
        return createErrorResponse(new Error("Deletion not confirmed"), {
          modelName,
          fieldName,
          hint: "The field is removed only when confirmDeletion is true; removal permanently deletes the field and all its data.",
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
          hint: "Model or field not found. modelNames and modelFieldNames list the valid names.",
        });
      }

      return createErrorResponse(error, {
        modelName,
        fieldName,
        hint: "This can happen when Anki is not running or the model or field name is wrong",
      });
    }
  }
}
