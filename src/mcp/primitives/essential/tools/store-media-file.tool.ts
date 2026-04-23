import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { storeMediaFile } from "./mediaActions/actions/storeMediaFile.action";

@Injectable()
export class StoreMediaFileTool {
  private readonly logger = new Logger(StoreMediaFileTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "storeMediaFile",
    description:
      "Upload a media file to Anki's collection.media folder. Supports base64 data, absolute file paths, or URLs. Perfect for workflows like ElevenLabs TTS -> Anki audio flashcards.",
    parameters: z.object({
      filename: z
        .string()
        .describe(
          'Filename to store in Anki (e.g., "pronunciation.mp3", "image.jpg")',
        ),
      data: z.string().optional().describe("Base64-encoded file content"),
      path: z
        .string()
        .optional()
        .describe(
          "Absolute path to a local media file (images, audio, video only)",
        ),
      url: z.string().optional().describe("URL to download file from"),
      deleteExisting: z
        .boolean()
        .optional()
        .default(true)
        .describe("Overwrite existing file (default: true)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      filename: z.string(),
      message: z.string(),
      prefixedWithUnderscore: z.boolean(),
    }),
    annotations: {
      title: "Store Media File",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
    },
  })
  async execute(
    params: {
      filename: string;
      data?: string;
      path?: string;
      url?: string;
      deleteExisting?: boolean;
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Executing storeMediaFile: ${params.filename}`);
      await context.reportProgress({ progress: 25, total: 100 });

      const result = await storeMediaFile(
        {
          filename: params.filename,
          data: params.data,
          path: params.path,
          url: params.url,
          deleteExisting: params.deleteExisting,
        },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute storeMediaFile", error);
      return createErrorResponse(error, {
        action: "storeMediaFile",
        hint: "Make sure Anki is running and the media source (data/path/url) is valid",
      });
    }
  }
}
