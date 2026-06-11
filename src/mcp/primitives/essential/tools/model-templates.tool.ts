import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving card templates (Front/Back HTML) for a specific model/note type
 */
@Injectable()
export class ModelTemplatesTool {
  private readonly logger = new Logger(ModelTemplatesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "modelTemplates",
    description:
      "Get the card templates (Front and Back HTML) for a specific note type (model). " +
      "Returns each card template's Front and Back HTML content. " +
      "Use this before updateModelTemplates to see current templates and plan changes.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe("The name of the model/note type to get templates for"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      templates: z.record(
        z.string(),
        z.object({
          Front: z.string(),
          Back: z.string(),
        }),
      ),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Get Note Type Templates",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async modelTemplates({ modelName }: { modelName: string }) {
    try {
      this.logger.log(`Retrieving templates for model: ${modelName}`);

      const templates = await this.ankiClient.invoke<{
        [cardName: string]: { Front: string; Back: string };
      }>("modelTemplates", {
        modelName: modelName,
      });

      if (!templates || Object.keys(templates).length === 0) {
        this.logger.warn(`No templates found for model: ${modelName}`);
        return createErrorResponse(
          new Error(`Model "${modelName}" not found or has no card templates`),
          {
            modelName: modelName,
            hint: "Use modelNames tool to see available models",
          },
        );
      }

      const cardCount = Object.keys(templates).length;
      this.logger.log(
        `Retrieved ${cardCount} templates for model ${modelName}`,
      );

      return {
        success: true,
        modelName: modelName,
        templates: templates,
        message: `Retrieved ${cardCount} card template(s) for model "${modelName}"`,
        hint: "Use updateModelTemplates to modify the Front/Back HTML of these card templates",
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve templates for model ${modelName}`,
        error,
      );
      return createErrorResponse(error, {
        modelName: modelName,
        hint: "Make sure the model name is correct and Anki is running",
      });
    }
  }
}
