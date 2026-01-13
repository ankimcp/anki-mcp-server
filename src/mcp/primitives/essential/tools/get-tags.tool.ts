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
 * Tool for retrieving all tags from the Anki collection.
 *
 * This helps AI agents discover existing tags before creating/updating notes,
 * preventing tag duplication and maintaining consistency.
 *
 * @see https://github.com/ankimcp/anki-mcp-server/issues/13
 */
@Injectable()
export class GetTagsTool {
  private readonly logger = new Logger(GetTagsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "getTags",
    description:
      "Get all tags in the Anki collection. Use this to discover existing tags before creating notes to maintain consistency and prevent tag duplication (e.g., avoiding 'roman-empire' vs 'roman_empire' vs 'RomanEmpire').",
    parameters: z.object({
      pattern: z
        .string()
        .optional()
        .describe(
          "Optional filter pattern - returns only tags containing this string (case-insensitive)",
        ),
    }),
  })
  async getTags({ pattern }: { pattern?: string }, context: Context) {
    try {
      this.logger.log(
        `Retrieving tags from Anki${pattern ? ` (filter: ${pattern})` : ""}`,
      );
      await context.reportProgress({ progress: 25, total: 100 });

      // Get all tags from AnkiConnect
      const allTags = await this.ankiClient.invoke<string[]>("getTags");

      await context.reportProgress({ progress: 75, total: 100 });

      if (!allTags || allTags.length === 0) {
        this.logger.log("No tags found");
        await context.reportProgress({ progress: 100, total: 100 });
        return createSuccessResponse({
          success: true,
          message: "No tags found in Anki collection",
          tags: [],
          total: 0,
        });
      }

      // Apply client-side filtering if pattern provided
      let tags = allTags;
      if (pattern) {
        const lowerPattern = pattern.toLowerCase();
        tags = allTags.filter((tag) =>
          tag.toLowerCase().includes(lowerPattern),
        );
      }

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(
        `Found ${tags.length} tags${pattern ? ` (filtered from ${allTags.length})` : ""}`,
      );

      return createSuccessResponse({
        success: true,
        tags: tags,
        total: tags.length,
        ...(pattern && { filtered: true, totalUnfiltered: allTags.length }),
        message: pattern
          ? `Found ${tags.length} tags matching "${pattern}" (${allTags.length} total)`
          : `Found ${tags.length} tags`,
      });
    } catch (error) {
      this.logger.error("Failed to retrieve tags", error);
      return createErrorResponse(error, {
        hint: "Make sure Anki is running and AnkiConnect is installed",
      });
    }
  }
}
