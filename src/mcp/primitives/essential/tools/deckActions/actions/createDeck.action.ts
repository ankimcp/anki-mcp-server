import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for createDeck action
 */
export interface CreateDeckParams {
  /** The name of the deck to create. Use "::" for parent::child structure (max 2 levels) */
  deckName: string;
}

/**
 * Result of createDeck action
 */
export interface CreateDeckResult {
  success: boolean;
  deckId?: number;
  deckName: string;
  message: string;
  created: boolean;
  exists?: boolean;
  parentDeck?: string;
  childDeck?: string;
}

/**
 * Create a new empty Anki deck
 *
 * Supports parent::child structure (e.g., "Japanese::Tokyo" creates parent deck
 * "Japanese" and child deck "Tokyo"). Maximum 2 levels of nesting allowed.
 * Will not overwrite existing decks.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#createdeck
 */
export async function createDeck(
  params: CreateDeckParams,
  client: AnkiConnectClient,
): Promise<CreateDeckResult> {
  const { deckName } = params;

  // Validate deck name doesn't have more than 2 levels
  const parts = deckName.split("::");
  if (parts.length > 2) {
    throw new Error("Deck name can have maximum 2 levels (parent::child)");
  }

  // Check for empty parts
  if (parts.some((part) => part.trim() === "")) {
    throw new Error("Deck name parts cannot be empty");
  }

  // Create the deck using AnkiConnect
  const deckId = await client.invoke<number>("createDeck", {
    deck: deckName,
  });

  if (!deckId) {
    // Check if deck exists by listing all decks
    const existingDecks = await client.invoke<string[]>("deckNames");
    const deckExists = existingDecks.includes(deckName);

    if (deckExists) {
      return {
        success: true,
        message: `Deck "${deckName}" already exists`,
        deckName: deckName,
        created: false,
        exists: true,
      };
    }

    throw new Error("Failed to create deck - unknown error");
  }

  const result: CreateDeckResult = {
    success: true,
    deckId: deckId,
    deckName: deckName,
    message: `Successfully created deck "${deckName}"`,
    created: true,
  };

  // If it's a parent::child structure, note both decks were created
  if (parts.length === 2) {
    result.parentDeck = parts[0];
    result.childDeck = parts[1];
    result.message = `Successfully created parent deck "${parts[0]}" and child deck "${parts[1]}"`;
  }

  return result;
}
