import { Injectable, Logger } from "@nestjs/common";
import { Tool } from "@rekog/mcp-nest";
import type { Context } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";

/**
 * Tool for searching notes using Anki's query syntax
 */
@Injectable()
export class FindNotesTool {
  private readonly logger = new Logger(FindNotesTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "findNotes",
    description:
      "Search for notes using Anki query syntax. Returns an array of note IDs matching the query. " +
      'Examples: "deck:Spanish", "tag:verb", "is:due", "front:hello", "added:1" (cards added today), ' +
      '"prop:due<=2" (cards due within 2 days), "flag:1" (red flag), "is:suspended"',
    parameters: z.object({
      query: z
        .string()
        .min(1)
        .describe(
          'Anki search query. Use Anki query syntax like "deck:DeckName", "tag:tagname", ' +
            '"is:due", "is:new", "is:review", "front:text", "back:text", or combine with spaces for AND, ' +
            "OR for alternatives. Empty string returns all notes.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      noteIds: z.array(z.number()),
      count: z.number(),
      query: z.string(),
      message: z.string(),
      hint: z.string().optional(),
    }),
    annotations: {
      title: "Find Notes",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async findNotes({ query }: { query: string }, context: Context) {
    try {
      this.logger.log(`Searching for notes with query: "${query}"`);
      await context.reportProgress({ progress: 25, total: 100 });

      // Call AnkiConnect findNotes action
      const noteIds = await this.ankiClient.invoke<number[]>("findNotes", {
        query: query,
      });

      await context.reportProgress({ progress: 75, total: 100 });

      if (!noteIds || noteIds.length === 0) {
        this.logger.log("No notes found matching the query");
        await context.reportProgress({ progress: 100, total: 100 });

        return {
          success: true,
          noteIds: [],
          count: 0,
          query: query,
          message: "No notes found matching the search criteria",
          hint: "Try a broader search query or check your deck/tag names",
        };
      }

      await context.reportProgress({ progress: 100, total: 100 });
      this.logger.log(`Found ${noteIds.length} notes matching the query`);

      return {
        success: true,
        noteIds: noteIds,
        count: noteIds.length,
        query: query,
        message: `Found ${noteIds.length} note${noteIds.length === 1 ? "" : "s"} matching the query`,
        hint:
          noteIds.length > 100
            ? "Large result set. Consider using notesInfo with smaller batches for detailed information."
            : "Use notesInfo tool to get detailed information about these notes",
      };
    } catch (error) {
      this.logger.error("Failed to search for notes", error);

      // Check for specific error types
      if (error instanceof Error) {
        if (error.message.includes("query")) {
          return createErrorResponse(error, {
            query,
            hint: "Invalid query syntax. Check Anki documentation for valid search syntax.",
            examples: [
              '"deck:DeckName" - all notes in a deck',
              '"tag:important" - notes with specific tag',
              '"is:due" - cards that are due for review',
              '"added:7" - notes added in last 7 days',
              '"front:word" - notes with "word" in front field',
            ],
          });
        }
      }

      return createErrorResponse(error, {
        query,
        hint: "Make sure Anki is running and the query syntax is valid",
      });
    }
  }
}
