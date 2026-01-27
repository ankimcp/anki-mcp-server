import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  createSuccessResponse,
  createErrorResponse,
} from "@/mcp/utils/anki.utils";
import { addTags, type AddTagsResult } from "./actions/addTags.action";
import { removeTags, type RemoveTagsResult } from "./actions/removeTags.action";
import {
  replaceTags,
  type ReplaceTagsResult,
} from "./actions/replaceTags.action";
import {
  clearUnusedTags,
  type ClearUnusedTagsResult,
} from "./actions/clearUnusedTags.action";

/**
 * Unified tag actions tool for managing Anki note tags
 * Supports: addTags, removeTags, replaceTags, clearUnusedTags
 *
 * Note: For reading/discovering tags, use the separate getTags tool.
 */
@Injectable()
export class TagActionsTool {
  private readonly logger = new Logger(TagActionsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "tagActions",
    description: `Manage tags on Anki notes. Supports four actions:
- addTags: Add tags to specified notes (notes: number[], tags: string)
- removeTags: Remove tags from specified notes (notes: number[], tags: string)
- replaceTags: Rename a tag across specified notes (notes: number[], tagToReplace: string, replaceWithTag: string)
- clearUnusedTags: Remove orphaned tags not used by any notes (no params)

For discovering existing tags, use the separate getTags tool.
Tags in addTags/removeTags are space-separated strings (e.g., "tag1 tag2 tag3").`,
    parameters: z.object({
      action: z
        .enum(["addTags", "removeTags", "replaceTags", "clearUnusedTags"])
        .describe("The tag action to perform"),
      notes: z
        .array(z.number())
        .optional()
        .describe(
          "[addTags, removeTags, replaceTags] Array of note IDs to modify",
        ),
      tags: z
        .string()
        .optional()
        .describe(
          '[addTags, removeTags] Space-separated tags (e.g., "tag1 tag2")',
        ),
      tagToReplace: z
        .string()
        .optional()
        .describe("[replaceTags] The tag to search for and replace"),
      replaceWithTag: z
        .string()
        .optional()
        .describe("[replaceTags] The tag to replace with"),
    }),
  })
  async execute(
    params: {
      action: "addTags" | "removeTags" | "replaceTags" | "clearUnusedTags";
      notes?: number[];
      tags?: string;
      tagToReplace?: string;
      replaceWithTag?: string;
    },
    context: Context,
  ) {
    try {
      this.logger.log(`Executing tag action: ${params.action}`);

      let result:
        | AddTagsResult
        | RemoveTagsResult
        | ReplaceTagsResult
        | ClearUnusedTagsResult;

      // Dispatch to appropriate action handler
      switch (params.action) {
        case "addTags":
          if (!params.notes || params.notes.length === 0) {
            throw new Error("notes array is required for addTags action");
          }
          if (!params.tags) {
            throw new Error("tags string is required for addTags action");
          }
          await context.reportProgress({ progress: 25, total: 100 });
          result = await addTags(
            { notes: params.notes, tags: params.tags },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "removeTags":
          if (!params.notes || params.notes.length === 0) {
            throw new Error("notes array is required for removeTags action");
          }
          if (!params.tags) {
            throw new Error("tags string is required for removeTags action");
          }
          await context.reportProgress({ progress: 25, total: 100 });
          result = await removeTags(
            { notes: params.notes, tags: params.tags },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "replaceTags":
          if (!params.notes || params.notes.length === 0) {
            throw new Error("notes array is required for replaceTags action");
          }
          if (!params.tagToReplace) {
            throw new Error("tagToReplace is required for replaceTags action");
          }
          if (!params.replaceWithTag) {
            throw new Error(
              "replaceWithTag is required for replaceTags action",
            );
          }
          await context.reportProgress({ progress: 25, total: 100 });
          result = await replaceTags(
            {
              notes: params.notes,
              tagToReplace: params.tagToReplace,
              replaceWithTag: params.replaceWithTag,
            },
            this.ankiClient,
          );
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        case "clearUnusedTags":
          await context.reportProgress({ progress: 50, total: 100 });
          result = await clearUnusedTags({}, this.ankiClient);
          await context.reportProgress({ progress: 100, total: 100 });
          break;

        default: {
          // TypeScript exhaustiveness check
          const _exhaustive: never = params.action;
          throw new Error(`Unknown action: ${_exhaustive}`);
        }
      }

      this.logger.log(`Successfully executed ${params.action}`);
      return createSuccessResponse(result);
    } catch (error) {
      this.logger.error(`Failed to execute ${params.action}`, error);
      return createErrorResponse(error, {
        action: params.action,
        hint: "Make sure Anki is running and the note IDs are valid",
      });
    }
  }
}
