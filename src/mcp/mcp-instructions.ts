/**
 * Server-level guidance advertised via the `initialize` result's
 * `instructions` field, shared by every transport through
 * `createMcpStrategy()`. It carries the cross-tool context that individual
 * tool descriptions state only as facts about themselves.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  "This server works on the user's local Anki collection through the AnkiConnect add-on.",
  "The tools read and write the local collection (storeMediaFile and updateNoteFields can also download media from URLs given to them); the sync tool exchanges it with AnkiWeb. Syncing is something to offer at the start and end of a study session rather than run unasked.",
  "A review session follows get_due_cards → present_card (question first, answer on request) → rate_card. rate_card records a real review, so its rating is the user's own assessment.",
  "The gui* tools act on the Anki window on the user's screen and are for when the user asks for them.",
  "Changes made through these tools land in the user's real collection and study history.",
].join(" ");
