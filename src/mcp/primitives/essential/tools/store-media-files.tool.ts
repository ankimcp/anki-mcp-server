import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import {
  AnkiConnectClient,
  ReadOnlyModeError,
} from "@/mcp/clients/anki-connect.client";
import { createErrorResponse, getErrorHint } from "@/mcp/utils/anki.utils";
import { MediaImportDirNotFoundError } from "@/mcp/utils/media-validation.utils";
import { storeMediaFile } from "./mediaActions/actions/storeMediaFile.action";

/** Result for a single media file in the batch */
interface MediaFileBatchResult {
  index: number;
  status: "stored" | "failed";
  filename: string;
  prefixedWithUnderscore?: boolean;
  error?: string;
  hint?: string;
}

/**
 * Tool for uploading multiple media files to Anki in a single batch.
 * Uses sequential storeMediaFile calls internally to support partial success.
 */
@McpController()
export class StoreMediaFilesTool {
  private readonly logger = new Logger(StoreMediaFilesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "storeMediaFiles",
    description:
      "Upload multiple media files to Anki's collection.media folder in a single batch — faster than repeated storeMediaFile calls for more than one file. Up to 100 files via base64 data, absolute file paths, or URLs. Supports partial success: individual validation or transfer failures are reported per entry without aborting the rest of the batch. By default files with the same name are overwritten.",
    parameters: z.object({
      deleteExisting: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Overwrite existing files with the same name unless overridden per file (default: true)",
        ),
      files: z
        .array(
          z.object({
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
              .describe("Override overwrite setting for this file"),
          }),
        )
        .min(1)
        .max(100)
        .describe("Array of media files to upload (1-100)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      totalRequested: z.number(),
      stored: z.number(),
      failed: z.number(),
      results: z.array(
        z.object({
          index: z.number(),
          status: z.enum(["stored", "failed"]),
          filename: z.string(),
          prefixedWithUnderscore: z.boolean().optional(),
          error: z.string().optional(),
          hint: z.string().optional(),
        }),
      ),
    }),
    annotations: {
      title: "Store Media Files",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  })
  async execute(
    @Payload()
    params: {
      deleteExisting?: boolean;
      files: Array<{
        filename: string;
        data?: string;
        path?: string;
        url?: string;
        deleteExisting?: boolean;
      }>;
    },
  ) {
    const defaultDeleteExisting = params.deleteExisting ?? true;

    try {
      this.logger.log(
        `Executing storeMediaFiles for ${params.files.length} file(s)`,
      );

      const results: MediaFileBatchResult[] = [];
      let storedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < params.files.length; i++) {
        const entry = params.files[i];

        try {
          const res = await storeMediaFile(
            {
              filename: entry.filename,
              data: entry.data,
              path: entry.path,
              url: entry.url,
              deleteExisting: entry.deleteExisting ?? defaultDeleteExisting,
            },
            this.ankiClient,
          );

          results.push({
            index: i,
            status: "stored",
            filename: res.filename,
            prefixedWithUnderscore: res.prefixedWithUnderscore,
          });
          storedCount++;
        } catch (error) {
          if (
            error instanceof ReadOnlyModeError ||
            error instanceof MediaImportDirNotFoundError
          ) {
            throw error;
          }

          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const hint = getErrorHint(error);

          results.push({
            index: i,
            status: "failed",
            filename: entry.filename,
            error: errorMessage,
            ...(hint !== undefined ? { hint } : {}),
          });
          failedCount++;
        }
      }

      this.logger.log(
        `storeMediaFiles batch complete: ${storedCount} stored, ${failedCount} failed`,
      );

      return {
        success: storedCount > 0,
        totalRequested: params.files.length,
        stored: storedCount,
        failed: failedCount,
        results,
      };
    } catch (error) {
      this.logger.error("Failed to execute storeMediaFiles", error);
      return createErrorResponse(error, {
        action: "storeMediaFiles",
        totalRequested: params.files.length,
        hint: "This can happen when Anki is not running or a media configuration setting is invalid",
      });
    }
  }
}
