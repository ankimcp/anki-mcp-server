import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { getMediaFilesNames } from "./mediaActions/actions/getMediaFilesNames.action";

@Injectable()
export class GetMediaFilesNamesTool {
  private readonly logger = new Logger(GetMediaFilesNamesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "getMediaFilesNames",
    description:
      "List media files in Anki's collection.media folder, optionally filtered by a glob-style pattern.",
    parameters: z.object({
      pattern: z
        .string()
        .optional()
        .describe('Optional filter pattern (e.g., "*.mp3")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      files: z.array(z.string()),
      count: z.number(),
      message: z.string(),
      pattern: z.string().optional(),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { pattern?: string }, context: Context) {
    try {
      this.logger.log(
        `Executing getMediaFilesNames${params.pattern ? ` (pattern: ${params.pattern})` : ""}`,
      );
      await context.reportProgress({ progress: 50, total: 100 });

      const result = await getMediaFilesNames(
        { pattern: params.pattern },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute getMediaFilesNames", error);
      return createErrorResponse(error, {
        action: "getMediaFilesNames",
        hint: "Make sure Anki is running",
      });
    }
  }
}
