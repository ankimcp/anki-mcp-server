import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for updating card templates of an existing model
 */
@Injectable()
export class UpdateModelTemplatesTool {
  private readonly logger = new Logger(UpdateModelTemplatesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "updateModelTemplates",
    description:
      "Update the card templates (Front and Back HTML) for an existing note type (model). " +
      "Each card template defines how the card's front and back sides are rendered. " +
      "Use modelTemplates first to see current templates, then modify and pass back the templates object. " +
      "Changes apply to all cards using this model. " +
      "WARNING: Invalid HTML or missing required fields may break card rendering.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe(
          'Name of the model to update (e.g., "Basic", "Cloze")',
        ),
      templates: z
        .record(
          z.string(),
          z.object({
            Front: z.string().describe("HTML template for the front/question side"),
            Back: z.string().describe("HTML template for the back/answer side"),
          }),
        )
        .describe(
          "Card templates keyed by card name (e.g., { \"Card 1\": { Front: \"...\", Back: \"...\" } }). " +
            "Use modelTemplates first to get the current structure, then modify the Front/Back HTML as needed.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      templateCount: z.number(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Update Note Type Templates",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async updateModelTemplates({
    modelName,
    templates,
  }: {
    modelName: string;
    templates: Record<string, { Front: string; Back: string }>;
  }) {
    try {
      this.logger.log(`Updating templates for model: ${modelName}`);

      const templateCount = Object.keys(templates).length;

      await this.ankiClient.invoke("updateModelTemplates", {
        model: {
          name: modelName,
          templates,
        },
      });

      this.logger.log(
        `Successfully updated ${templateCount} templates for model: ${modelName}`,
      );

      return {
        success: true,
        modelName,
        templateCount,
        message: `Successfully updated ${templateCount} card template(s) for model "${modelName}"`,
        hint: "Template changes apply to all cards using this model. Use guiBrowse to preview changes.",
      };
    } catch (error) {
      this.logger.error(
        `Failed to update templates for model ${modelName}`,
        error,
      );

      // Check for model not found error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("does not exist") ||
        errorMessage.includes("model not found")
      ) {
        return createErrorResponse(error, {
          modelName,
          hint: "Model not found. Use modelNames tool to see available models.",
        });
      }

      return createErrorResponse(error, {
        modelName,
        hint: "Make sure Anki is running and the model name is correct.",
      });
    }
  }
}
