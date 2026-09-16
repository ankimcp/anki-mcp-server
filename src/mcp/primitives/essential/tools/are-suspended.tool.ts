import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import {
  cardIdsSchema,
  cardSuspensionStatusSchema,
  suspensionCountsSchema,
  fetchSuspensionStatuses,
  summarizeSuspensionStatuses,
} from "@/mcp/utils/card-suspension.utils";

/**
 * Input schema, exported so tests can assert cap/type constraints via
 * `safeParse` without going through the mcp-nest handler.
 */
export const areSuspendedInputSchema = z.object({
  cards: cardIdsSchema,
});

/**
 * Tool for checking whether cards are suspended.
 */
@McpController()
export class AreSuspendedTool {
  private readonly logger = new Logger(AreSuspendedTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "areSuspended",
    description:
      "Check whether cards are suspended, without changing anything. Card IDs (not note IDs) — " +
      "use get_cards, get_due_cards, or notesInfo to obtain them. The response preserves input " +
      "order; a card ID that doesn't exist comes back with suspended: null rather than being " +
      "dropped or throwing, so a single bad ID doesn't fail the whole batch.",
    parameters: areSuspendedInputSchema,
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      cards: z
        .array(cardSuspensionStatusSchema)
        .describe("Per-card suspension status, in the same order as the input"),
      ...suspensionCountsSchema.shape,
    }),
    annotations: {
      title: "Check Suspended Cards",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(@Payload() params: { cards: number[] }) {
    const cards = Array.isArray(params?.cards) ? params.cards : [];

    try {
      this.logger.log(`Executing areSuspended: ${cards.length} card(s)`);

      if (cards.length === 0) {
        throw new Error("cards array is required for areSuspended action");
      }

      const statuses = await fetchSuspensionStatuses(cards, this.ankiClient);
      const counts = summarizeSuspensionStatuses(statuses);

      this.logger.log(
        `areSuspended: ${counts.suspendedCount} suspended, ${counts.unsuspendedCount} not suspended, ${counts.missingCount} missing`,
      );

      return {
        success: true,
        message:
          `Checked ${counts.total} card(s): ${counts.suspendedCount} suspended, ` +
          `${counts.unsuspendedCount} not suspended, ${counts.missingCount} missing`,
        cards: statuses,
        ...counts,
      };
    } catch (error) {
      this.logger.error("Failed to execute areSuspended", error);
      return createErrorResponse(error, {
        action: "areSuspended",
        cardIds: cards,
        hint: "Make sure Anki is running and the card IDs are valid card IDs (not note IDs)",
      });
    }
  }
}
