import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { clearUnusedTags } from "./tagActions/actions/clearUnusedTags.action";

@McpController()
export class ClearUnusedTagsTool {
  private readonly logger = new Logger(ClearUnusedTagsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "clearUnusedTags",
    description:
      "Remove orphaned tags that are not used by any notes in the collection, across the whole collection at once. Removed tags disappear from Anki's tag list (including tags the user created but has not applied yet); notes are not changed.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
    }),
    annotations: {
      title: "Clear Unused Tags",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async execute(@Payload() _params: Record<string, never>) {
    try {
      this.logger.log("Executing clearUnusedTags");

      const result = await clearUnusedTags({}, this.ankiClient);

      return result;
    } catch (error) {
      this.logger.error("Failed to execute clearUnusedTags", error);
      return createErrorResponse(error, {
        action: "clearUnusedTags",
        hint: "This can happen when Anki is not running",
      });
    }
  }
}
