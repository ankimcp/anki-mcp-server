import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { deleteMediaFile } from "./mediaActions/actions/deleteMediaFile.action";

@McpController()
export class DeleteMediaFileTool {
  private readonly logger = new Logger(DeleteMediaFileTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "deleteMediaFile",
    description:
      "Remove a media file from Anki's collection.media folder (Anki moves it to its media trash). Cards that reference the file stop showing or playing it; the deletion also reaches other devices on the next AnkiWeb sync.",
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
      title: "Delete Media File",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async execute(@Payload() params: { filename: string }) {
    try {
      this.logger.log(`Executing deleteMediaFile: ${params.filename}`);

      const result = await deleteMediaFile(
        { filename: params.filename },
        this.ankiClient,
      );

      return result;
    } catch (error) {
      this.logger.error("Failed to execute deleteMediaFile", error);
      return createErrorResponse(error, {
        action: "deleteMediaFile",
        hint: "This can happen when Anki is not running or the filename is invalid",
      });
    }
  }
}
