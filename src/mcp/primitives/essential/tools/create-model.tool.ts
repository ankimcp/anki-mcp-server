import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import type { CardTemplate } from "@/mcp/types/anki.types";

/**
 * Tool for creating a new Anki model/note type
 */
@Injectable()
export class CreateModelTool {
  private readonly logger = new Logger(CreateModelTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "createModel",
    description:
      "Create a new note type (model) in Anki with custom fields, card templates, and styling. " +
      "Useful for creating specialized models like RTL (Right-to-Left) language models for Hebrew, Arabic, etc. " +
      "Each model defines the structure of notes and how cards are generated from them.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe(
          'Unique name for the new model (e.g., "Basic RTL", "Advanced Vocabulary")',
        ),
      inOrderFields: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          'Field names in order (e.g., ["Front", "Back"]). At least one field required.',
        ),
      cardTemplates: z
        .array(
          z.object({
            Name: z.string().min(1).describe('Template name (e.g., "Card 1")'),
            Front: z
              .string()
              .min(1)
              .describe(
                'Front template HTML with field placeholders (e.g., "{{Front}}")',
              ),
            Back: z
              .string()
              .min(1)
              .describe(
                'Back template HTML with field placeholders (e.g., "{{FrontSide}}<hr id=answer>{{Back}}")',
              ),
          }),
        )
        .min(1)
        .describe(
          "Card templates (at least one required). Each template generates one card per note.",
        ),
      css: z
        .string()
        .optional()
        .describe(
          'Optional CSS styling for cards. For RTL languages, include "direction: rtl;" in .card class.',
        ),
      isCloze: z
        .boolean()
        .optional()
        .default(false)
        .describe("Create as cloze deletion model (default: false)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      modelId: z.number().nullable(),
      fields: z.array(z.string()),
      templateCount: z.number(),
      hasCss: z.boolean(),
      isCloze: z.boolean(),
      message: z.string(),
      warnings: z.array(z.string()).optional(),
    }),
    annotations: {
      title: "Create Note Type",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
    },
  })
  async createModel(
    {
      modelName,
      inOrderFields,
      cardTemplates,
      css,
      isCloze,
    }: {
      modelName: string;
      inOrderFields: string[];
      cardTemplates: CardTemplate[];
      css?: string;
      isCloze?: boolean;
    },
    context: Context,
  ) {
    try {
      this.logger.log(
        `Creating model: ${modelName} with ${inOrderFields.length} fields`,
      );
      await context.reportProgress({ progress: 10, total: 100 });

      // Validate field references in templates (warning only, not error)
      const warnings: string[] = [];
      const fieldSet = new Set(inOrderFields);

      for (const template of cardTemplates) {
        const templateContent = `${template.Front} ${template.Back}`;
        // Simple regex to find {{FieldName}} references
        const fieldRefs = templateContent.match(/\{\{([^}]+)\}\}/g) || [];

        for (const ref of fieldRefs) {
          const fieldName = ref.slice(2, -2).trim();
          // Skip special Anki fields
          if (
            fieldName === "FrontSide" ||
            fieldName === "Tags" ||
            fieldName === "Type" ||
            fieldName === "Deck" ||
            fieldName === "Subdeck" ||
            fieldName === "Card" ||
            fieldName.startsWith("cloze:")
          ) {
            continue;
          }

          if (!fieldSet.has(fieldName)) {
            warnings.push(
              `Template "${template.Name}" references field "{{${fieldName}}}" which is not in inOrderFields`,
            );
          }
        }
      }

      await context.reportProgress({ progress: 30, total: 100 });

      // Create the model
      const result = await this.ankiClient.invoke<any>("createModel", {
        modelName,
        inOrderFields,
        cardTemplates,
        css,
        isCloze: isCloze ?? false,
      });

      await context.reportProgress({ progress: 80, total: 100 });

      // AnkiConnect returns the model configuration on success
      this.logger.log(`Successfully created model: ${modelName}`);

      await context.reportProgress({ progress: 100, total: 100 });

      const response: {
        success: boolean;
        modelName: string;
        modelId: number | null;
        fields: string[];
        templateCount: number;
        hasCss: boolean;
        isCloze: boolean;
        message: string;
        warnings?: string[];
      } = {
        success: true,
        modelName,
        modelId: result.id || null,
        fields: inOrderFields,
        templateCount: cardTemplates.length,
        hasCss: !!css,
        isCloze: isCloze || false,
        message: `Successfully created model "${modelName}" with ${inOrderFields.length} fields and ${cardTemplates.length} template(s)`,
      };

      if (warnings.length > 0) {
        response.warnings = warnings;
        response.message +=
          ". Note: Some warnings were detected (see warnings field).";
      }

      return response;
    } catch (error) {
      this.logger.error(`Failed to create model ${modelName}`, error);

      // Check for duplicate model name error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("already exists") ||
        errorMessage.includes("duplicate")
      ) {
        return createErrorResponse(error, {
          modelName,
          hint: "A model with this name already exists. Use a different name or use modelNames tool to see existing models.",
        });
      }

      return createErrorResponse(error, {
        modelName,
        hint: "Make sure Anki is running and all parameters are valid.",
      });
    }
  }
}
