import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for retrieving all available model/note type names from Anki
 */
@Injectable()
export class ModelNamesTool {
  private readonly logger = new Logger(ModelNamesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "modelNames",
    description:
      "Get a list of all available note type (model) names in Anki. Use this to see what note types are available before creating notes.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      modelNames: z.array(z.string()),
      total: z.number(),
      message: z.string(),
      commonTypes: z.object({
        basic: z.string().nullable(),
        basicReversed: z.string().nullable(),
        cloze: z.string().nullable(),
      }),
    }),
    annotations: {
      title: "List Note Types",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async modelNames(_args: Record<string, never>, context: Context) {
    try {
      this.logger.log("Retrieving model names from Anki");
      await context.reportProgress({ progress: 25, total: 100 });

      // Get list of model names from AnkiConnect
      const modelNames = await this.ankiClient.invoke<string[]>("modelNames");

      await context.reportProgress({ progress: 75, total: 100 });

      if (!modelNames || modelNames.length === 0) {
        this.logger.log("No models found");
        await context.reportProgress({ progress: 100, total: 100 });
        return {
          success: true,
          message: "No note types found in Anki",
          modelNames: [],
          total: 0,
          commonTypes: {
            basic: null,
            basicReversed: null,
            cloze: null,
          },
        };
      }

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(`Found ${modelNames.length} models`);

      return {
        success: true,
        modelNames: modelNames,
        total: modelNames.length,
        message: `Found ${modelNames.length} note types`,
        commonTypes: {
          basic: modelNames.includes("Basic") ? "Basic" : null,
          basicReversed: modelNames.includes("Basic (and reversed card)")
            ? "Basic (and reversed card)"
            : null,
          cloze: modelNames.includes("Cloze") ? "Cloze" : null,
        },
      };
    } catch (error) {
      this.logger.error("Failed to retrieve model names", error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and AnkiConnect is installed",
      });
    }
  }
}
