import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving field names for a specific model/note type
 */
@Injectable()
export class ModelFieldNamesTool {
  private readonly logger = new Logger(ModelFieldNamesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "modelFieldNames",
    description:
      "Get the field names for a specific note type (model). Use this to know what fields are required when creating notes of this type.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe("The name of the model/note type to get fields for"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      fieldNames: z.array(z.string()),
      total: z.number(),
      message: z.string(),
      example: z.record(z.string(), z.string()).optional(),
      hint: z.string().optional(),
    }),
    annotations: {
      title: "Get Note Type Fields",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async modelFieldNames(
    { modelName }: { modelName: string },
    context: Context,
  ) {
    try {
      this.logger.log(`Retrieving field names for model: ${modelName}`);
      await context.reportProgress({ progress: 25, total: 100 });

      // Get field names for the specified model
      const fieldNames = await this.ankiClient.invoke<string[]>(
        "modelFieldNames",
        {
          modelName: modelName,
        },
      );

      await context.reportProgress({ progress: 75, total: 100 });

      if (!fieldNames) {
        this.logger.warn(`Model not found: ${modelName}`);
        await context.reportProgress({ progress: 100, total: 100 });
        return createErrorResponse(
          new Error(`Model "${modelName}" not found`),
          {
            modelName: modelName,
            hint: "Use modelNames tool to see available models",
          },
        );
      }

      if (fieldNames.length === 0) {
        this.logger.warn(`No fields found for model: ${modelName}`);
        await context.reportProgress({ progress: 100, total: 100 });
        return {
          success: true,
          modelName: modelName,
          fieldNames: [],
          total: 0,
          message: `Model "${modelName}" has no fields`,
        };
      }

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Found ${fieldNames.length} fields for model ${modelName}`,
      );

      // Provide example based on common model types
      let exampleFields: Record<string, string> | undefined;
      const lowerModelName = modelName.toLowerCase();

      if (
        lowerModelName.includes("basic") &&
        !lowerModelName.includes("reversed")
      ) {
        exampleFields = {
          Front: "Question or prompt text",
          Back: "Answer or response text",
        };
      } else if (
        lowerModelName.includes("basic") &&
        lowerModelName.includes("reversed")
      ) {
        exampleFields = {
          Front: "First side of the card",
          Back: "Second side of the card",
        };
      } else if (lowerModelName.includes("cloze")) {
        exampleFields = {
          Text: "The {{c1::hidden}} text will be replaced with [...] on the card",
          "Back Extra": "Additional information or hints",
        };
      }

      const response: {
        success: boolean;
        modelName: string;
        fieldNames: string[];
        total: number;
        message: string;
        example?: Record<string, string>;
        hint?: string;
      } = {
        success: true,
        modelName: modelName,
        fieldNames: fieldNames,
        total: fieldNames.length,
        message: `Model "${modelName}" has ${fieldNames.length} field${fieldNames.length !== 1 ? "s" : ""}`,
      };

      if (exampleFields) {
        response.example = exampleFields;
        response.hint =
          "Use these field names as keys when creating notes with addNote tool";
      }

      return response;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve field names for model ${modelName}`,
        error,
      );
      return createErrorResponse(error, {
        modelName: modelName,
        hint: "Make sure the model name is correct and Anki is running",
      });
    }
  }
}
