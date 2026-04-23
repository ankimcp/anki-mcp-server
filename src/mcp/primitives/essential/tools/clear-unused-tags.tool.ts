import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { clearUnusedTags } from "./tagActions/actions/clearUnusedTags.action";

@Injectable()
export class ClearUnusedTagsTool {
  private readonly logger = new Logger(ClearUnusedTagsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "clearUnusedTags",
    description:
      "Remove orphaned tags that are not used by any notes in the collection. CRITICAL: This is destructive and permanent - only run when the user explicitly asks to clean up tags.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
    },
  })
  async execute(_params: Record<string, never>, context: Context) {
    try {
      this.logger.log("Executing clearUnusedTags");
      await context.reportProgress({ progress: 50, total: 100 });

      const result = await clearUnusedTags({}, this.ankiClient);

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute clearUnusedTags", error);
      return createErrorResponse(error, {
        action: "clearUnusedTags",
        hint: "Make sure Anki is running",
      });
    }
  }
}
