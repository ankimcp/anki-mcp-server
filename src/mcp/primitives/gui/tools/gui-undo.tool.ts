import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for undoing the last action in Anki
 */
@Injectable()
export class GuiUndoTool {
  private readonly logger = new Logger(GuiUndoTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiUndo",
    description:
      "Undo the last action or card in Anki. Returns true if undo succeeded, false otherwise. " +
      "IMPORTANT: Only use when user explicitly requests undoing an action. " +
      "This tool is for note editing/creation workflows, NOT for review sessions. " +
      "Use this to undo mistakes in note creation, editing, or card management.",
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
      destructiveHint: false,
      idempotentHint: false,
    },
  })
  async guiUndo(_args: Record<string, never>, context: Context) {
    try {
      this.logger.log("Undoing last action in Anki");
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiUndo action
      const success = await this.ankiClient.invoke<boolean>("guiUndo");

      await context.reportProgress({ progress: 100, total: 100 });

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
        hint: "The previous action has been reversed. Check Anki GUI to verify.",
      };
    } catch (error) {
      this.logger.error("Failed to undo action", error);

      return createErrorResponse(error, {
        hint: "Make sure Anki is running and the GUI is visible",
      });
    }
  }
}
