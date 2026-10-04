import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for getting selected note IDs from the Card Browser
 */
@McpController()
export class GuiSelectedNotesTool {
  private readonly logger = new Logger(GuiSelectedNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiSelectedNotes",
    description:
      "Reads the IDs of the notes the user has selected in the Card Browser window of the Anki desktop app. Changes nothing on screen. " +
      "Returns an empty list when nothing is selected or the Card Browser is not open. Useful when the user refers to notes they selected in Anki.",
    parameters: z.object({}),
    outputSchema: z.object({
      success: z.boolean(),
      noteIds: z.array(z.number()),
      noteCount: z.number(),
      message: z.string(),
      hint: z.string(),
    }),
    annotations: {
      title: "Get Selected Notes",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  })
  async guiSelectedNotes(@Payload() _args: Record<string, never>) {
    try {
      this.logger.log("Getting selected notes from Card Browser");

      // Call AnkiConnect guiSelectedNotes action
      const noteIds =
        await this.ankiClient.invoke<number[]>("guiSelectedNotes");

      this.logger.log(
        `Retrieved ${noteIds.length} selected note(s) from Card Browser`,
      );

      if (noteIds.length === 0) {
        return {
          success: true,
          noteIds: [],
          noteCount: 0,
          message: "No notes are currently selected in the Card Browser",
          hint: "Nothing is selected in the Card Browser, or the Card Browser is not open.",
        };
      }

      return {
        success: true,
        noteIds,
        noteCount: noteIds.length,
        message: `Retrieved ${noteIds.length} selected note ID(s) from Card Browser`,
        hint: "notesInfo returns details for these note IDs.",
      };
    } catch (error) {
      this.logger.error("Failed to get selected notes", error);

      if (error instanceof Error) {
        if (
          error.message.includes("browser") ||
          error.message.includes("not open")
        ) {
          return createErrorResponse(error, {
            hint: "Card Browser is not open.",
          });
        }
      }

      return createErrorResponse(error, {
        hint: "This can happen when Anki is not running or the Card Browser is not open",
      });
    }
  }
}
