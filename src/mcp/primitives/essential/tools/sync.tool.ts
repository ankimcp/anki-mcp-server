import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for synchronizing Anki collections with AnkiWeb
 */
@McpController()
export class SyncTool {
  private readonly logger = new Logger(SyncTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "sync",
    description:
      "Synchronizes the local Anki collection with AnkiWeb (network call; needs the Anki desktop app to be logged in to AnkiWeb). The other tools work on the local collection (apart from media downloads from URLs passed to storeMediaFile or updateNoteFields), so reviews made on other devices show up only after a sync, and changes made here reach other devices only after a sync.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      timestamp: z.string(),
    }),
    annotations: {
      title: "Sync with AnkiWeb",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  })
  async sync(@Payload() _args: Record<string, never>) {
    try {
      this.logger.log("Synchronizing Anki collection with AnkiWeb");

      // Call AnkiConnect sync action
      await this.ankiClient.invoke("sync");

      this.logger.log("Anki sync completed successfully");

      return {
        success: true,
        message: "Successfully synchronized with AnkiWeb",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error("Failed to sync with AnkiWeb", error);

      return createErrorResponse(error, {
        hint: "This can happen when Anki is not running or the Anki desktop app is not logged into AnkiWeb",
      });
    }
  }
}
