import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for undoing the last action in Anki
 */
@McpController()
export class GuiUndoTool {
  private readonly logger = new Logger(GuiUndoTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiUndo",
    description:
      "Triggers Anki's Edit > Undo in the desktop app, reverting whatever Anki's undo history holds as the most recent action — which may be something the user did in Anki rather than a change made through this server, and some AnkiConnect changes (e.g. updateNoteFields) are not recorded in that history at all. " +
      "AnkiConnect reports success once the command is issued, even when there was nothing to undo. For when the user asks to undo something in Anki.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      undone: z.boolean(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Undo Last Action",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  })
  async guiUndo(@Payload() _args: Record<string, never>) {
    try {
      this.logger.log("Undoing last action in Anki");

      // Call AnkiConnect guiUndo action
      const success = await this.ankiClient.invoke<boolean>("guiUndo");

      if (!success) {
        this.logger.warn("Nothing to undo");
        return {
          success: true,
          undone: false,
          message: "Nothing to undo",
          hint: "There are no recent actions to undo in Anki.",
        };
      }

      this.logger.log("Last action undone successfully");

      return {
        success: true,
        undone: true,
        message: "Last action undone successfully",
        hint: "The previous action has been reversed; the Anki GUI shows the result.",
      };
    } catch (error) {
      this.logger.error("Failed to undo action", error);

      return createErrorResponse(error, {
        hint: "This can happen when Anki is not running or its GUI is not visible",
      });
    }
  }
}
