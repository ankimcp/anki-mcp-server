import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for repositioning (reordering) a field in an existing note type
 */
@Injectable()
export class RepositionModelFieldTool {
  private readonly logger = new Logger(RepositionModelFieldTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "repositionModelField",
    description:
      "Change the position of a field within an Anki note type (model). " +
      "Fields are ordered 0-based: index 0 is the first field. " +
      "(Which field is the sort field is a separate model setting and is not changed by repositioning.) " +
      "Use modelFieldNames to see the current field order before repositioning.",
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
        .describe('Name of the field to reposition (e.g., "Grammar")'),
      index: z
        .number()
        .int()
        .min(0)
        .describe("New 0-based position for the field (0 = first field)."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      fieldName: z.string(),
      newIndex: z.number(),
      message: z.string(),
    }),
    annotations: {
      title: "Reposition Field in Note Type",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async repositionModelField({
    modelName,
    fieldName,
    index,
  }: {
    modelName: string;
    fieldName: string;
    index: number;
  }) {
    try {
      this.logger.log(
        `Repositioning field "${fieldName}" to index ${index} in model "${modelName}"`,
      );

      // Pre-flight: AnkiConnect does not validate this operation — an
      // out-of-range index is silently clamped instead of erroring, so
      // validate against the model's current fields before writing.
      const fields = await this.ankiClient.invoke<string[]>("modelFieldNames", {
        modelName,
      });

      if (!fields || fields.length === 0) {
        return createErrorResponse(
          new Error(`Model "${modelName}" has no fields or does not exist`),
          {
            modelName,
            fieldName,
            index,
            hint: "Model not found. Use modelNames tool to see available models.",
          },
        );
      }

      if (!fields.includes(fieldName)) {
        return createErrorResponse(
          new Error(
            `Field "${fieldName}" does not exist in model "${modelName}"`,
          ),
          {
            modelName,
            fieldName,
            index,
            hint: "Field names are case-sensitive. Use modelFieldNames to see the current field names.",
          },
        );
      }

      if (index < 0 || index > fields.length - 1) {
        return createErrorResponse(
          new Error(
            `Index ${index} is out of range for model "${modelName}". ` +
              `Valid range is 0-${fields.length - 1} (the model has ${fields.length} fields). ` +
              "AnkiConnect would silently clamp the index instead of erroring.",
          ),
          {
            modelName,
            fieldName,
            index,
            hint: "Index out of range. Use modelFieldNames to see how many fields exist.",
          },
        );
      }

      await this.ankiClient.invoke("modelFieldReposition", {
        modelName,
        fieldName,
        index,
      });

      this.logger.log(
        `Successfully repositioned field "${fieldName}" to index ${index} in model "${modelName}"`,
      );

      return {
        success: true,
        modelName,
        fieldName,
        newIndex: index,
        message: `Successfully moved field "${fieldName}" to position ${index} in model "${modelName}"`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to reposition field "${fieldName}" in model "${modelName}"`,
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
          index,
          hint: "Model or field not found. Use modelNames and modelFieldNames tools to verify names.",
        });
      }

      return createErrorResponse(error, {
        modelName,
        fieldName,
        index,
        hint: "Make sure Anki is running and the model and field names are correct.",
      });
    }
  }
}
