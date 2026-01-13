/**
 * Shared test data fixtures for Anki MCP tests
 */

export const mockNotes = {
  spanish: {
    noteId: 1502298033753,
    modelName: "Basic",
    fields: {
      Front: { value: "¿Cómo estás?", order: 0 },
      Back: { value: "How are you?", order: 1 },
    },
    tags: ["spanish", "greetings"],
    cards: [1502298033754],
    mod: 1234567890,
  },
  japanese: {
    noteId: 1502298033757,
    modelName: "Basic (and reversed card)",
    fields: {
      Front: { value: "こんにちは", order: 0 },
      Back: { value: "Hello", order: 1 },
    },
    tags: ["japanese", "greetings"],
    cards: [1502298033758, 1502298033759],
    mod: 1234567890,
  },
  withHtml: {
    noteId: 1502298033760,
    modelName: "Basic",
    fields: {
      Front: { value: "<b>Bold text</b> and <i>italic</i>", order: 0 },
      Back: { value: "<ul><li>Item 1</li><li>Item 2</li></ul>", order: 1 },
    },
    tags: ["test", "html"],
    cards: [1502298033761],
    mod: 1234567890,
  },
};

export const mockDecks = {
  withStats: {
    "1651445861967": {
      deck_id: 1651445861967,
      name: "Spanish",
      new_count: 20,
      learn_count: 5,
      review_count: 10,
      total_in_deck: 150,
    },
    "1651445861968": {
      deck_id: 1651445861968,
      name: "Japanese::JLPT N5",
      new_count: 50,
      learn_count: 10,
      review_count: 25,
      total_in_deck: 500,
    },
  },
  names: ["Default", "Spanish", "Japanese::JLPT N5", "French::Beginner"],
};

export const mockCards = {
  dueCard: {
    cardId: 1502298033754,
    noteId: 1502298033753,
    note: 1502298033753,
    deckName: "Spanish",
    question: "¿Cómo estás?",
    answer: "How are you?",
    due: 1,
    interval: 1,
    factor: 2500,
    reviews: 3,
    lapses: 0,
    type: 2,
    queue: 2,
    modelName: "Basic",
    fieldOrder: 0,
    ord: 0,
    css: ".card { font-family: arial; }",
  },
  newCard: {
    cardId: 1502298033758,
    noteId: 1502298033757,
    note: 1502298033757,
    deckName: "Japanese::JLPT N5",
    question: "こんにちは",
    answer: "Hello",
    due: 0,
    interval: 0,
    factor: 2500,
    reviews: 0,
    lapses: 0,
    type: 0,
    queue: 0,
    modelName: "Basic (and reversed card)",
    fieldOrder: 0,
    ord: 0,
    css: ".card { font-family: arial; }",
  },
};

export const mockQueries = {
  valid: {
    allDue: "is:due",
    deckSpecific: "deck:Spanish",
    withTag: "tag:greetings",
    combined: "deck:Spanish tag:spanish",
    frontSearch: "front:Cómo",
  },
  invalid: {
    malformed: "deck:",
    unknownOperator: "invalid:query",
  },
};

export const mockErrors = {
  networkError: new Error("fetch failed"),
  permissionError: new Error("Permission denied"),
  notFoundError: new Error("Note not found"),
  ankiNotRunning: new Error(
    "Cannot connect to Anki. Please ensure Anki is running and AnkiConnect plugin is installed.",
  ),
  invalidQuery: new Error("Invalid query syntax"),
};
