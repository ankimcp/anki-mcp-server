import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving CSS styling for a specific model/note type
 */
@Injectable()
export class ModelStylingTool {
  private readonly logger = new Logger(ModelStylingTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "modelStyling",
    description:
      "Get the CSS styling for a specific note type (model). This CSS is used when rendering cards of this type.",
    parameters: z.object({
      modelName: z
        .string()
        .min(1)
        .describe("The name of the model/note type to get styling for"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      modelName: z.string(),
      css: z.string(),
      cssInfo: z.object({
        length: z.number(),
        hasCardStyling: z.boolean(),
        hasFrontStyling: z.boolean(),
        hasBackStyling: z.boolean(),
        hasClozeStyling: z.boolean(),
      }),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  })
  async modelStyling({ modelName }: { modelName: string }, context: Context) {
    try {
      this.logger.log(`Retrieving CSS styling for model: ${modelName}`);
      await context.reportProgress({ progress: 25, total: 100 });

      // Get styling for the specified model
      const styling = await this.ankiClient.invoke<{ css: string }>(
        "modelStyling",
        {
          modelName: modelName,
        },
      );

      await context.reportProgress({ progress: 75, total: 100 });

      if (!styling || !styling.css) {
        this.logger.warn(`No styling found for model: ${modelName}`);
        await context.reportProgress({ progress: 100, total: 100 });
        return createErrorResponse(
          new Error(`Model "${modelName}" not found or has no styling`),
          {
            modelName: modelName,
            hint: "Use modelNames tool to see available models",
          },
        );
      }

      await context.reportProgress({ progress: 100, total: 100 });

      // Parse CSS to find key styling elements
      const css = styling.css;
      const cssLength = css.length;
      const hasCardClass = css.includes(".card");
      const hasFrontClass = css.includes(".front");
      const hasBackClass = css.includes(".back");
      const hasClozeClass = css.includes(".cloze");

      this.logger.log(
        `Retrieved CSS styling for model ${modelName} (${cssLength} chars)`,
      );

      return {
        success: true,
        modelName: modelName,
        css: css,
        cssInfo: {
          length: cssLength,
          hasCardStyling: hasCardClass,
          hasFrontStyling: hasFrontClass,
          hasBackStyling: hasBackClass,
          hasClozeStyling: hasClozeClass,
        },
        message: `Retrieved CSS styling for model "${modelName}"`,
        hint: "This CSS is automatically applied when cards of this type are rendered in Anki",
      };
    } catch (error) {
      this.logger.error(
        `Failed to retrieve styling for model ${modelName}`,
        error,
      );
      return createErrorResponse(error, {
        modelName: modelName,
        hint: "Make sure the model name is correct and Anki is running",
      });
    }
  }
}
