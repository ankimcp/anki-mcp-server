import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for synchronizing Anki collections with AnkiWeb
 */
@Injectable()
export class SyncTool {
  private readonly logger = new Logger(SyncTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "sync",
    description:
      "Synchronize local Anki collection with AnkiWeb. IMPORTANT: Always sync at the START of a review session (before getting cards) and at the END when user indicates they are done. This ensures data consistency across devices.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      timestamp: z.string(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async sync(_args: Record<string, never>, context: Context) {
    try {
      this.logger.log("Synchronizing Anki collection with AnkiWeb");
      await context.reportProgress({ progress: 25, total: 100 });

      // Call AnkiConnect sync action
      await this.ankiClient.invoke("sync");

      this.logger.log("Anki sync completed successfully");
      await context.reportProgress({ progress: 100, total: 100 });

      return {
        success: true,
        message: "Successfully synchronized with AnkiWeb",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error("Failed to sync with AnkiWeb", error);

      return createErrorResponse(error, {
        hint: "Make sure Anki is running and you are logged into AnkiWeb",
      });
    }
  }
}
