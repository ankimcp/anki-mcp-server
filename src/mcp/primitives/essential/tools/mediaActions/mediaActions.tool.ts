import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import {
  storeMediaFile,
  type StoreMediaFileResult,
} from "./actions/storeMediaFile.action";
import {
  retrieveMediaFile,
  type RetrieveMediaFileResult,
} from "./actions/retrieveMediaFile.action";
import {
  getMediaFilesNames,
  type GetMediaFilesNamesResult,
} from "./actions/getMediaFilesNames.action";
import {
  deleteMediaFile,
  type DeleteMediaFileResult,
} from "./actions/deleteMediaFile.action";

/**
 * Unified media actions tool for managing Anki media files
 * Supports: storeMediaFile, retrieveMediaFile, getMediaFilesNames, deleteMediaFile
 */
@Injectable()
export class MediaActionsTool {
  private readonly logger = new Logger(MediaActionsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "mediaActions",
    description: `Manage Anki media files (audio/images). Supports four actions:
- storeMediaFile: Upload media to Anki (supports base64 data, file paths, or URLs)
- retrieveMediaFile: Download media from Anki as base64
- getMediaFilesNames: List media files (optionally filter by pattern)
- deleteMediaFile: Remove media file from Anki

Perfect for workflows like ElevenLabs TTS → Anki audio flashcards.`,
    parameters: z.object({
      action: z
        .enum([
          "storeMediaFile",
          "retrieveMediaFile",
          "getMediaFilesNames",
          "deleteMediaFile",
        ])
        .describe("The media action to perform"),
      filename: z
        .string()
        .optional()
        .describe(
          "Filename (required for storeMediaFile, retrieveMediaFile, deleteMediaFile)",
        ),
      data: z
        .string()
        .optional()
        .describe("[storeMediaFile only] Base64-encoded file content"),
      path: z
        .string()
        .optional()
        .describe("[storeMediaFile only] Absolute file path"),
      url: z
        .string()
        .optional()
        .describe("[storeMediaFile only] URL to download file from"),
      deleteExisting: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "[storeMediaFile only] Overwrite existing file (default: true)",
        ),
      pattern: z
        .string()
        .optional()
        .describe('[getMediaFilesNames only] Filter pattern (e.g., "*.mp3")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      filename: z.string().optional(),
      message: z.string(),
      // storeMediaFile fields
      prefixedWithUnderscore: z.boolean().optional(),
      // retrieveMediaFile fields
      data: z.string().nullable().optional(),
      found: z.boolean().optional(),
      // getMediaFilesNames fields
      files: z.array(z.string()).optional(),
      count: z.number().optional(),
      pattern: z.string().optional(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  })
  async execute(
    params: {
      action:
        | "storeMediaFile"
        | "retrieveMediaFile"
        | "getMediaFilesNames"
        | "deleteMediaFile";
      filename?: string;
      data?: string;
      path?: string;
      url?: string;
      deleteExisting?: boolean;
      pattern?: string;
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Executing media action: ${params.action}`);

      let result:
        | StoreMediaFileResult
        | RetrieveMediaFileResult
        | GetMediaFilesNamesResult
        | DeleteMediaFileResult;

      // Dispatch to appropriate action handler
      switch (params.action) {
        case "storeMediaFile":
          if (!params.filename) {
            throw new Error("filename is required for storeMediaFile action");
          }
          await context.reportProgress({ progress: 25, total: 100 });
          result = await storeMediaFile(
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
          break;

        case "retrieveMediaFile":
          if (!params.filename) {
            throw new Error(
              "filename is required for retrieveMediaFile action",
            );
          }
          await context.reportProgress({ progress: 50, total: 100 });
          result = await retrieveMediaFile(
            { filename: params.filename },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "getMediaFilesNames":
          await context.reportProgress({ progress: 50, total: 100 });
          result = await getMediaFilesNames(
            { pattern: params.pattern },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "deleteMediaFile":
          if (!params.filename) {
            throw new Error("filename is required for deleteMediaFile action");
          }
          await context.reportProgress({ progress: 50, total: 100 });
          result = await deleteMediaFile(
            { filename: params.filename },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        default: {
          // TypeScript exhaustiveness check
          const _exhaustive: never = params.action;
          throw new Error(`Unknown action: ${_exhaustive}`);
        }
      }

      this.logger.log(`Successfully executed ${params.action}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to execute ${params.action}`, error);
      return createErrorResponse(error, {
        action: params.action,
        hint: "Make sure Anki is running and the media file/path is valid",
      });
    }
  }
}
