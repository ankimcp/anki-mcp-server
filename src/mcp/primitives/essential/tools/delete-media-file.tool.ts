import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { deleteMediaFile } from "./mediaActions/actions/deleteMediaFile.action";

@Injectable()
export class DeleteMediaFileTool {
  private readonly logger = new Logger(DeleteMediaFileTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deleteMediaFile",
    description:
      "Remove a media file from Anki's collection.media folder. CRITICAL: This is destructive and permanent - only delete media the user explicitly confirmed for deletion.",
    parameters: z.object({
      filename: z
        .string()
        .describe(
          'Filename of the media file to delete (e.g., "old_audio.mp3")',
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      filename: z.string(),
      message: z.string(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  })
  async execute(params: { filename: string }, context: Context) {
    try {
      this.logger.log(`Executing deleteMediaFile: ${params.filename}`);
      await context.reportProgress({ progress: 50, total: 100 });

      const result = await deleteMediaFile(
        { filename: params.filename },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute deleteMediaFile", error);
      return createErrorResponse(error, {
        action: "deleteMediaFile",
        hint: "Make sure Anki is running and the filename is valid",
      });
    }
  }
}
