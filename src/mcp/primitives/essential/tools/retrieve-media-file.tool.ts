import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { retrieveMediaFile } from "./mediaActions/actions/retrieveMediaFile.action";

@Injectable()
export class RetrieveMediaFileTool {
  private readonly logger = new Logger(RetrieveMediaFileTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "retrieveMediaFile",
    description:
      "Download a media file from Anki's collection.media folder. Returns base64-encoded file content, or null if the file is not found.",
    parameters: z.object({
      filename: z
        .string()
        .describe(
          'Filename of the media file to retrieve (e.g., "pronunciation.mp3")',
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      filename: z.string(),
      data: z.string().nullable(),
      message: z.string(),
      found: z.boolean(),
    }),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { filename: string }, context: Context) {
    try {
      this.logger.log(`Executing retrieveMediaFile: ${params.filename}`);
      await context.reportProgress({ progress: 50, total: 100 });

      const result = await retrieveMediaFile(
        { filename: params.filename },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute retrieveMediaFile", error);
      return createErrorResponse(error, {
        action: "retrieveMediaFile",
        hint: "Make sure Anki is running and the filename is valid",
      });
    }
  }
}
