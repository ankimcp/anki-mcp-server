import { Logger } from "@nestjs/common";
import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { createErrorResponse } from "@/mcp/utils/anki.utils";
import { setDeckLimits } from "./deckActions/actions/setDeckLimits.action";

@McpController()
export class SetDeckLimitsTool {
  private readonly logger = new Logger(SetDeckLimitsTool.name);

  constructor(private readonly ankiClient: AnkiConnectClient) {}

  @Tool({
    name: "setDeckLimits",
    description:
      "Set daily limits (new cards per day and/or reviews per day) for an Anki deck and refresh the deck browser GUI.",
    parameters: z.object({
      deckName: z
        .string()
        .min(1)
        .describe(
          "The name of the deck to configure (e.g. 'BIOCHIMICA - ESAME DI STATO')",
        ),
      newPerDay: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Number of new cards per day limit (e.g. 0 to pause new cards, or 25)",
        ),
      reviewPerDay: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Maximum review cards per day limit (optional)"),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      deckName: z.string(),
      configName: z.string(),
      newPerDay: z.number().optional(),
      reviewPerDay: z.number().optional(),
      message: z.string(),
    }),
    annotations: {
      title: "Set Deck Limits",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
    },
  })
  async execute(
    @Payload()
    params: {
      deckName: string;
      newPerDay?: number;
      reviewPerDay?: number;
    },
  ) {
    try {
      this.logger.log(`Executing setDeckLimits for deck: ${params.deckName}`);

      const result = await setDeckLimits(params, this.ankiClient);
      return result;
    } catch (error) {
      this.logger.error("Failed to execute setDeckLimits", error);
      return createErrorResponse(error, {
        action: "setDeckLimits",
        hint: "Make sure Anki is running and the deck name is valid",
      });
    }
  }
}
