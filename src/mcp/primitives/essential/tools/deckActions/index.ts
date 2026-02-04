/**
 * Deck actions module exports
 */

export { DeckActionsTool } from "./deckActions.tool";

// Export action types for testing
export type {
  ChangeDeckParams,
  ChangeDeckResult,
} from "./actions/changeDeck.action";

export type {
  ListDecksParams,
  ListDecksResult,
} from "./actions/listDecks.action";

export type {
  CreateDeckParams,
  CreateDeckResult,
} from "./actions/createDeck.action";

export type {
  DeckStatsParams,
  DeckStatsResult,
  AnkiDeckStatsResponse,
} from "./actions/deckStats.action";
