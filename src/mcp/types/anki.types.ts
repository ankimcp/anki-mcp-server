/**
 * Anki-related TypeScript type definitions
 */

/**
 * Card type enumeration (matches Anki's internal type numbers)
 */
export enum CardType {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

/**
 * AnkiConnect card information structure
 */
export interface AnkiCard {
  cardId: number;
  fields: Record<string, { value: string; order: number }>;
  fieldOrder: number;
  question: string;
  answer: string;
  modelName: string;
  ord: number;
  deckName: string;
  css: string;
  factor?: number;
  interval?: number;
  note: number;
  type: number;
  queue: number;
  due?: number;
  reps?: number;
  lapses?: number;
  left?: number;
  mod?: number;
  flags?: number;
  tags?: string[];
}

/**
 * Simplified card structure for MCP responses
 */
export interface SimplifiedCard {
  cardId: number;
  front: string;
  back: string;
  deckName: string;
  modelName: string;
  due: number;
  interval: number;
  factor: number;
}

/**
 * Card presentation structure with optional answer visibility
 */
export interface CardPresentation {
  cardId: number;
  front: string;
  back?: string; // Only included when showing answer
  deckName: string;
  modelName: string;
  tags: string[];
  currentInterval: number;
  easeFactor: number;
  reviews: number;
  lapses: number;
  cardType: string;
  noteId: number;
}

/**
 * Deck information structure
 */
export interface DeckInfo {
  name: string;
  stats?: DeckStats;
}

/**
 * Deck statistics
 */
export interface DeckStats {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_new: number;
  total_cards: number;
}

/**
 * Response structure from AnkiConnect getDeckStats action.
 * The response is a record keyed by deck ID (as string).
 *
 * Note: `total_in_deck` counts every card in the deck, while
 * `new_count`/`learn_count`/`review_count` come from the scheduler's due tree
 * and exclude suspended/buried cards — so the three buckets won't always sum
 * to `total_in_deck`.
 */
export interface AnkiDeckStatsResponse {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

/**
 * Rating options for spaced repetition
 */
export enum CardRating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

/**
 * AnkiConnect request structure
 */
export interface AnkiConnectRequest {
  action: string;
  version: number;
  params?: Record<string, any>;
  key?: string;
}

/**
 * AnkiConnect response structure
 */
export interface AnkiConnectResponse<T = any> {
  result: T;
  error: string | null;
}

/**
 * Options for duplicate checking when adding notes
 */
export interface NoteOptions {
  /** Whether to allow adding duplicate notes (default: false) */
  allowDuplicate?: boolean;

  /** Scope for duplicate checking: "deck" checks only target deck, "collection" checks entire collection */
  duplicateScope?: "deck" | "collection";

  /** Advanced options for duplicate scope checking */
  duplicateScopeOptions?: {
    /** Specific deck to check for duplicates in (if undefined, uses target deck) */
    deckName?: string;
    /** Whether to check child decks for duplicates (default: false) */
    checkChildren?: boolean;
    /** Whether to check across all note types/models (default: false) */
    checkAllModels?: boolean;
  };
}

/**
 * Parameters for adding a new note to Anki
 */
export interface AddNoteParams {
  /** The deck to add the note to */
  deckName: string;

  /** The note type/model to use (e.g., "Basic", "Basic (and reversed card)", "Cloze") */
  modelName: string;

  /** Field values as key-value pairs (e.g., {"Front": "question", "Back": "answer"}) */
  fields: Record<string, string>;

  /** Optional tags to add to the note for organization and searching */
  tags?: string[];

  /** Options for duplicate checking and handling */
  options?: NoteOptions;
}

/**
 * Information about an Anki note type/model
 */
export interface Model {
  /** The name of the model as displayed in Anki */
  name: string;

  /** Unique identifier for the model */
  id: number;

  /** CSS styling used for rendering cards of this type */
  css: string;

  /** Array of field names in the order they appear in the model */
  fields: string[];
}

/**
 * Detailed information about an Anki note
 */
export interface NoteInfo {
  /** The unique identifier of the note */
  noteId: number;

  /** The name of the model/note type used by this note */
  modelName: string;

  /** Tags associated with the note */
  tags: string[];

  /** Fields with their content and order */
  fields: Record<string, { value: string; order: number }>;

  /** Array of card IDs associated with this note */
  cards: number[];

  /** Modification timestamp (Unix timestamp in milliseconds) */
  mod: number;
}

/**
 * Parameters for updating note fields
 */
export interface UpdateNoteFieldsParams {
  /** The note to update */
  note: {
    /** ID of the note to update */
    id: number;

    /** Fields to update with new content (HTML supported) */
    fields: Record<string, string>;

    /** Optional audio files to add */
    audio?: Array<{
      url: string;
      filename: string;
      fields: string[];
    }>;

    /** Optional images to add */
    picture?: Array<{
      url: string;
      filename: string;
      fields: string[];
    }>;
  };
}

/**
 * Card template definition for model creation
 */
export interface CardTemplate {
  /** Display name of the template */
  Name: string;

  /** Front side HTML template with field placeholders (e.g., "{{Front}}") */
  Front: string;

  /** Back side HTML template with field placeholders (e.g., "{{FrontSide}}<hr id=answer>{{Back}}") */
  Back: string;
}

/**
 * Parameters for creating a new model
 */
export interface CreateModelParams {
  /** Unique name for the new model */
  modelName: string;

  /** Field names in the order they should appear */
  inOrderFields: string[];

  /** Card template definitions (at least one required) */
  cardTemplates: CardTemplate[];

  /** Optional CSS styling for cards */
  css?: string;

  /** Whether this is a cloze deletion model (default: false) */
  isCloze?: boolean;
}

/**
 * Parameters for updating model styling
 */
export interface UpdateModelStylingParams {
  /** Model to update */
  model: {
    /** Name of the model to update */
    name: string;

    /** New CSS styling content */
    css: string;
  };
}

/**
 * Information about the current card in review mode
 */
export interface GuiCurrentCardInfo {
  /** HTML answer text */
  answer: string;

  /** HTML question text */
  question: string;

  /** Name of the deck containing this card */
  deckName: string;

  /** Name of the note type/model */
  modelName: string;

  /** Unique card identifier */
  cardId: number;

  /** Available rating buttons (e.g., [1, 2, 3] for Again, Hard, Good) */
  buttons: number[];

  /** Next review intervals for each button (e.g., ["<1m", "<10m", "4d"]) */
  nextReviews: string[];

  /** Card fields with values and order */
  fields?: Record<string, { value: string; order: number }>;
}

/**
 * Parameters for guiBrowse action
 */
export interface GuiBrowseParams {
  /** Anki search query (e.g., "deck:Spanish tag:verb") */
  query: string;

  /** Optional card reordering in browser */
  reorderCards?: {
    /** Sort order */
    order: "ascending" | "descending";

    /** Column to sort by */
    columnId: string;
  };
}

/**
 * Parameters for guiAddCards action
 */
export interface GuiAddCardsParams {
  /** Note details to pre-fill in Add Cards dialog */
  note: {
    /** Deck to add the note to */
    deckName: string;

    /** Note type/model to use */
    modelName: string;

    /** Field values to pre-fill */
    fields: Record<string, string>;

    /** Optional tags to add */
    tags?: string[];
  };
}
