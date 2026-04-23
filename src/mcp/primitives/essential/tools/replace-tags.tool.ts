import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { replaceTags } from "./tagActions/actions/replaceTags.action";

@Injectable()
export class ReplaceTagsTool {
  private readonly logger = new Logger(ReplaceTagsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "replaceTags",
    description:
      'Rename a tag across specified notes (e.g., "RomanEmpire" -> "roman-empire"). Single tag only; spaces are not allowed in either value.',
    parameters: z.object({
      notes: z
        .array(z.number())
        .min(1)
        .max(1000)
        .describe("Array of note IDs to modify"),
      tagToReplace: z.string().describe("The tag to search for and replace"),
      replaceWithTag: z.string().describe("The tag to replace with"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      notesAffected: z.number(),
      tagToReplace: z.string(),
      replaceWithTag: z.string(),
    }),
    annotations: {
      title: "Replace Tag",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(
    params: {
      notes: number[];
      tagToReplace: string;
      replaceWithTag: string;
    },
    context: Context,
  ) {
    try {
      this.logger.log(
        `Executing replaceTags on ${params.notes?.length ?? 0} note(s)`,
      );

      if (!params.notes || params.notes.length === 0) {
        throw new Error("notes array is required for replaceTags action");
      }
      if (!params.tagToReplace) {
        throw new Error("tagToReplace is required for replaceTags action");
      }
      if (!params.replaceWithTag) {
        throw new Error("replaceWithTag is required for replaceTags action");
      }

      await context.reportProgress({ progress: 25, total: 100 });

      const result = await replaceTags(
        {
          notes: params.notes,
          tagToReplace: params.tagToReplace,
          replaceWithTag: params.replaceWithTag,
        },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute replaceTags", error);
      return createErrorResponse(error, {
        action: "replaceTags",
        hint: "Make sure Anki is running and the note IDs are valid",
      });
    }
  }
}
