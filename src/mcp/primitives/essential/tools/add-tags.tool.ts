import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { addTags } from "./tagActions/actions/addTags.action";

@Injectable()
export class AddTagsTool {
  private readonly logger = new Logger(AddTagsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "addTags",
    description:
      'Add tags to specified notes. Tags is a space-separated string (e.g., "tag1 tag2 tag3"). Use getTags first to discover existing tags and prevent duplication.',
    parameters: z.object({
      notes: z
        .array(z.number())
        .min(1)
        .max(1000)
        .describe("Array of note IDs to modify"),
      tags: z
        .string()
        .describe('Space-separated tags to add (e.g., "tag1 tag2")'),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      notesAffected: z.number(),
      tagsAdded: z.array(z.string()),
    }),
    annotations: {
      title: "Add Tags",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(params: { notes: number[]; tags: string }, context: Context) {
    try {
      this.logger.log(
        `Executing addTags on ${params.notes?.length ?? 0} note(s)`,
      );

      if (!params.notes || params.notes.length === 0) {
        throw new Error("notes array is required for addTags action");
      }
      if (!params.tags) {
        throw new Error("tags string is required for addTags action");
      }

      await context.reportProgress({ progress: 25, total: 100 });

      const result = await addTags(
        { notes: params.notes, tags: params.tags },
        this.ankiClient,
      );

      await context.reportProgress({ progress: 100, total: 100 });
      return result;
    } catch (error) {
      this.logger.error("Failed to execute addTags", error);
      return createErrorResponse(error, {
        action: "addTags",
        hint: "Make sure Anki is running and the note IDs are valid",
      });
    }
  }
}
