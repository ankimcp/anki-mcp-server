import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for setDeckLimits action
 */
export interface SetDeckLimitsParams {
  /** Target deck name */
  deckName: string;

  /** Number of new cards per day limit (optional) */
  newPerDay?: number;

  /** Maximum review cards per day limit (optional) */
  reviewPerDay?: number;
}

/**
 * Result of setDeckLimits action
 */
export interface SetDeckLimitsResult {
  success: boolean;
  deckName: string;
  configName: string;
  newPerDay?: number;
  reviewPerDay?: number;
  message: string;
}

/**
 * Deck configuration interface matching Anki's deck config JSON
 */
interface DeckConfig {
  id: number;
  name: string;
  new: {
    perDay: number;
    [key: string]: unknown;
  };
  rev: {
    perDay: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Set daily limits (new cards per day and/or reviews per day) for an Anki deck
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#getdeckconfig
 * @see https://git.sr.ht/~foosoft/anki-connect#savedeckconfig
 */
export async function setDeckLimits(
  params: SetDeckLimitsParams,
  client: AnkiConnectClient,
): Promise<SetDeckLimitsResult> {
  const { deckName, newPerDay, reviewPerDay } = params;

  if (!deckName || deckName.trim() === "") {
    throw new Error("deckName cannot be empty");
  }

  if (newPerDay === undefined && reviewPerDay === undefined) {
    throw new Error(
      "At least one of newPerDay or reviewPerDay must be specified",
    );
  }

  if (newPerDay !== undefined && newPerDay < 0) {
    throw new Error("newPerDay must be greater than or equal to 0");
  }

  if (reviewPerDay !== undefined && reviewPerDay < 0) {
    throw new Error("reviewPerDay must be greater than or equal to 0");
  }

  const trimmedDeck = deckName.trim();

  // Retrieve current deck configuration
  const cfg = await client.invoke<DeckConfig>("getDeckConfig", {
    deck: trimmedDeck,
  });

  if (!cfg || !cfg.new || !cfg.rev) {
    throw new Error(
      `Deck configuration not found for "${trimmedDeck}". Ensure the deck exists.`,
    );
  }

  if (newPerDay !== undefined) {
    cfg.new.perDay = newPerDay;
  }

  if (reviewPerDay !== undefined) {
    cfg.rev.perDay = reviewPerDay;
  }

  // Save updated configuration
  const saved = await client.invoke<boolean>("saveDeckConfig", {
    config: cfg,
  });

  if (!saved) {
    throw new Error(`Failed to save deck configuration for "${trimmedDeck}"`);
  }

  // Attempt to refresh Anki GUI deck browser (non-fatal if it fails)
  try {
    await client.invoke("guiDeckBrowser");
  } catch {
    // Ignore GUI refresh failures in headless or review mode
  }

  const updates: string[] = [];
  if (newPerDay !== undefined) updates.push(`${newPerDay} new/day`);
  if (reviewPerDay !== undefined) updates.push(`${reviewPerDay} reviews/day`);

  return {
    success: true,
    deckName: trimmedDeck,
    configName: cfg.name,
    newPerDay: cfg.new.perDay,
    reviewPerDay: cfg.rev.perDay,
    message: `Successfully updated limits for deck "${trimmedDeck}": ${updates.join(", ")}`,
  };
}
