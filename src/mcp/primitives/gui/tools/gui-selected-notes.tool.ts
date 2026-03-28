import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";

/**
 * Tool for getting selected note IDs from the Card Browser
 */
@Injectable()
export class GuiSelectedNotesTool {
  private readonly logger = new Logger(GuiSelectedNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "guiSelectedNotes",
    description:
      "Get the IDs of notes currently selected in the Card Browser. Returns array of note IDs (empty if no selection). " +
      "IMPORTANT: Only use when user explicitly requests getting selected notes. " +
      "This tool is for note editing/creation workflows, NOT for review sessions. " +
      "The Card Browser must be open with cards selected.",
    parameters: z.object({}),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  })
  async guiSelectedNotes(_args: Record<string, never>, context: Context) {
    try {
      this.logger.log("Getting selected notes from Card Browser");
      await context.reportProgress({ progress: 50, total: 100 });

      // Call AnkiConnect guiSelectedNotes action
      const noteIds =
        await this.ankiClient.invoke<number[]>("guiSelectedNotes");

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Retrieved ${noteIds.length} selected note(s) from Card Browser`,
      );

      if (noteIds.length === 0) {
        return createSuccessResponse({
          success: true,
          noteIds: [],
          noteCount: 0,
          message: "No notes are currently selected in the Card Browser",
          hint: "Open the Card Browser (guiBrowse) and select some cards/notes first.",
        });
      }

      return createSuccessResponse({
        success: true,
        noteIds,
        noteCount: noteIds.length,
        message: `Retrieved ${noteIds.length} selected note ID(s) from Card Browser`,
        hint: "Use notesInfo to get details about these notes, or updateNoteFields/deleteNotes to modify them.",
      });
    } catch (error) {
      this.logger.error("Failed to get selected notes", error);

      if (error instanceof Error) {
        if (
          error.message.includes("browser") ||
          error.message.includes("not open")
        ) {
          return createErrorResponse(error, {
            hint: "Card Browser is not open. Use guiBrowse to open it first.",
          });
        }
      }

      return createErrorResponse(error, {
        hint: "Make sure Anki is running and the Card Browser is open",
      });
    }
  }
}
