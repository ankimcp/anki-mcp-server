import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { removeTags } from "./tagActions/actions/removeTags.action";

@Injectable()
export class RemoveTagsTool {
  private readonly logger = new Logger(RemoveTagsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "removeTags",
    description:
      'Remove tags from specified notes. Tags is a space-separated string (e.g., "tag1 tag2 tag3").',
    parameters: z.object({
      notes: z
        .array(z.number())
        .min(1)
        .max(1000)
        .describe("Array of note IDs to modify"),
      tags: z
        .string()
        .describe('Space-separated tags to remove (e.g., "tag1 tag2")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      notesAffected: z.number(),
      tagsRemoved: z.array(z.string()),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { notes: number[]; tags: string }, context: Context) {
    try {
      this.logger.log(
        `Executing removeTags on ${params.notes?.length ?? 0} note(s)`,
      );

      if (!params.notes || params.notes.length === 0) {
        throw new Error("notes array is required for removeTags action");
      }
      if (!params.tags) {
        throw new Error("tags string is required for removeTags action");
      }

      await context.reportProgress({ progress: 25, total: 100 });

      const result = await removeTags(
        { notes: params.notes, tags: params.tags },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute removeTags", error);
      return createErrorResponse(error, {
        action: "removeTags",
        hint: "Make sure Anki is running and the note IDs are valid",
      });
    }
  }
}
