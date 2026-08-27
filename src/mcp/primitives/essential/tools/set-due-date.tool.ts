import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import {
  AnkiCardInfo,
  fetchExistingCards,
} from "@/mcp/utils/card-validation.utils";

/**
 * Anki's due-date spec: a day count, an inclusive range, or either with a
 * trailing `!` meaning "also set the interval to this value".
 */
const DAYS_SPEC = /^(\d+)(?:-(\d+))?(!?)$/;

/**
 * Tool for rescheduling cards to a specific due date without recording a review.
 */
@McpController()
export class SetDueDateTool {
  private readonly logger = new Logger(SetDueDateTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "setDueDate",
    description:
      "Reschedule cards to become due in a given number of days, without recording a review. " +
      "Use this to bring a card forward (or push it back) when its current interval doesn't match how well " +
      "the user actually knows it — rating the card instead would log a fake review and skew its ease factor. " +
      "Unlike forgetCards this keeps the card's existing interval and ease unless you ask otherwise, so it is " +
      "the gentler option when the card's history is still worth keeping. " +
      "Note that applying this to a new card turns it into a review card.",
    parameters: z.object({
      cards: z
        .array(z.number())
        .min(1)
        .describe(
          "Array of card IDs to reschedule. Card IDs (not note IDs) — use findCards, " +
            "get_cards, or notesInfo to obtain them.",
        ),
      days: z
        .string()
        .describe(
          "How many days from now the cards become due. " +
            '"0" = today, "1" = tomorrow, "3-7" = a random day in that inclusive range ' +
            "(spreads a batch out instead of stacking it on one day). " +
            'Append "!" — e.g. "1!" — to also overwrite the card\'s interval with that value, ' +
            "rather than leaving the existing interval in place.",
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      message: z.string(),
      cardsAffected: z.number(),
      days: z.string().describe("The due-date spec that was applied"),
      intervalOverwritten: z
        .boolean()
        .describe(
          'True when the spec ended in "!", meaning the interval was reset to the day count',
        ),
      scheduled: z
        .array(
          z.object({
            cardId: z.number(),
            intervalDays: z
              .number()
              .describe("The card's interval after rescheduling"),
            due: z
              .number()
              .describe(
                "Anki's raw due value: days since collection creation for review cards, " +
                  "a queue position for new cards, a unix timestamp for learning cards",
              ),
          }),
        )
        .describe("Per-card scheduling state read back after the change"),
    }),
    annotations: {
      title: "Set Card Due Date",
      readOnlyHint: false,
      // Review history is preserved; only the next due date moves.
      destructiveHint: false,
      // Re-applying the same absolute spec lands on the same day, except for
      // ranges, which re-roll.
      idempotentHint: true,
    },
  })
  async execute(@Payload() params: { cards: number[]; days: string }) {
    const cards = params?.cards ?? [];
    const rawDays = params?.days;

    try {
      this.logger.log(
        `Executing setDueDate: ${cards.length} card(s) -> "${rawDays}"`,
      );

      if (cards.length === 0) {
        throw new Error("cards array is required for setDueDate action");
      }
      if (!rawDays || rawDays.trim() === "") {
        throw new Error("days is required for setDueDate action");
      }

      const days = rawDays.trim();
      const match = DAYS_SPEC.exec(days);
      if (!match) {
        throw new Error(
          `Invalid days spec "${days}". Expected a day count ("0", "5"), an ` +
            'inclusive range ("3-7"), optionally suffixed with "!" to also ' +
            'overwrite the interval ("1!").',
        );
      }

      const [, startStr, endStr] = match;
      if (endStr !== undefined && Number(endStr) < Number(startStr)) {
        throw new Error(
          `Invalid days range "${days}": the end of the range must not be ` +
            `earlier than the start.`,
        );
      }

      // Validate the IDs first — setDueDate returns true even for a list of
      // card IDs that don't exist, so a typo would otherwise look like success.
      await fetchExistingCards(
        cards,
        this.ankiClient,
        "No cards were rescheduled.",
      );

      await this.ankiClient.invoke<boolean>("setDueDate", { cards, days });

      // Read the scheduling back so the caller reports what Anki actually did
      // rather than what was requested — ranges in particular resolve to a
      // different day per card.
      const updated = await this.ankiClient.invoke<AnkiCardInfo[]>(
        "cardsInfo",
        {
          cards,
        },
      );

      const scheduled = cards.map((cardId, index) => ({
        cardId,
        intervalDays: updated?.[index]?.interval ?? 0,
        due: updated?.[index]?.due ?? 0,
      }));

      this.logger.log(`Rescheduled ${cards.length} card(s) to "${days}"`);

      return {
        success: true,
        message: `Successfully rescheduled ${cards.length} card(s) to "${days}"`,
        cardsAffected: cards.length,
        days,
        intervalOverwritten: days.endsWith("!"),
        scheduled,
      };
    } catch (error) {
      this.logger.error("Failed to execute setDueDate", error);
      return createErrorResponse(error, {
        action: "setDueDate",
        cardIds: cards,
        days: rawDays,
        hint: 'Make sure Anki is running, the card IDs are valid card IDs (not note IDs), and days looks like "0", "5", "3-7", or "1!"',
      });
    }
  }
}
