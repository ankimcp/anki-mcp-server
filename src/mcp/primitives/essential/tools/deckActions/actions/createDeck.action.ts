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
  /** For parent::child names, whether the parent deck already existed before this call */
  parentExisted?: boolean;
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

  // Check for empty parts. Anki would store such a part as "blank".
  const normalizedParts = normalizeDeckName(deckName).split("::");
  if (normalizedParts.some((part) => part === "")) {
    throw new Error("Deck name parts cannot be empty");
  }

  // AnkiConnect's createDeck returns the id of an existing deck instead of
  // failing, so existence has to be checked up front. Anki matches deck names
  // case-insensitively, so the lookup does too and reports the stored spelling.
  const existingDecks =
    await client.invoke<Record<string, number>>("deckNamesAndIds");
  const findExisting = (name: string): [string, number] | undefined => {
    const key = deckNameKey(name);
    return Object.entries(existingDecks).find(
      ([existingName]) => deckNameKey(existingName) === key,
    );
  };

  const existingResult = ([storedName, storedId]: [
    string,
    number,
  ]): CreateDeckResult => {
    const result: CreateDeckResult = {
      success: true,
      deckId: storedId,
      deckName: storedName,
      message: `Deck "${storedName}" already exists; nothing was created`,
      created: false,
      exists: true,
    };
    if (parts.length === 2) {
      const [storedParent, storedChild] = storedName.split("::");
      result.parentDeck = storedParent;
      result.childDeck = storedChild;
      result.parentExisted = true;
    }
    return result;
  };

  const existingDeck = findExisting(deckName);
  if (existingDeck) {
    return existingResult(existingDeck);
  }

  const deckId = await client.invoke<number>("createDeck", {
    deck: deckName,
  });

  if (!deckId) {
    throw new Error("Failed to create deck - unknown error");
  }

  // The name lookup only approximates Anki's case folding; an id that was
  // already in the collection means the deck existed after all.
  const existingById = Object.entries(existingDecks).find(
    ([, id]) => id === deckId,
  );
  if (existingById) {
    return existingResult(existingById);
  }

  // Anki compares deck names with full Unicode case folding, so a new child
  // can land under an existing parent that the name lookup missed (e.g.
  // "STRASSE::Kind" under "Straße"). The stored name is the authority.
  const storedName = await lookupStoredName(client, deckId);
  let parentName: string | undefined;
  let childName: string | undefined;
  let parentExisted: boolean | undefined;
  let resolvedName: string;
  if (storedName !== undefined) {
    resolvedName = storedName;
    if (parts.length === 2) {
      [parentName, childName] = storedName.split("::");
      parentExisted = Object.hasOwn(existingDecks, parentName);
    }
  } else {
    const existingParent =
      parts.length === 2 ? findExisting(parts[0]) : undefined;
    if (parts.length === 2) {
      parentName = existingParent ? existingParent[0] : normalizedParts[0];
      childName = normalizedParts[1];
      parentExisted = existingParent !== undefined;
    }
    resolvedName =
      parentName !== undefined
        ? `${parentName}::${childName}`
        : normalizedParts[0];
  }

  const result: CreateDeckResult = {
    success: true,
    deckId: deckId,
    deckName: resolvedName,
    message: `Successfully created deck "${resolvedName}"`,
    created: true,
  };

  // If it's a parent::child structure, report honestly whether the parent was
  // created here or already existed.
  if (parentName !== undefined && childName !== undefined) {
    result.parentDeck = parentName;
    result.childDeck = childName;
    result.parentExisted = parentExisted;
    result.message = parentExisted
      ? `Found existing parent deck "${parentName}"; created child deck "${childName}"`
      : `Created parent deck "${parentName}" and child deck "${childName}"`;
  }

  return result;
}

/**
 * The name Anki stored for a just-created deck, or undefined when the lookup
 * fails or does not list the id. The deck was created either way, so a
 * failed lookup must not turn the call into an error.
 */
async function lookupStoredName(
  client: AnkiConnectClient,
  deckId: number,
): Promise<string | undefined> {
  try {
    const decks =
      await client.invoke<Record<string, number>>("deckNamesAndIds");
    return Object.entries(decks ?? {}).find(([, id]) => id === deckId)?.[0];
  } catch {
    return undefined;
  }
}

/**
 * Approximates how Anki stores a deck name: each "::" component is
 * NFC-normalized, stripped of ASCII control characters, and stripped of
 * surrounding whitespace and colons.
 */
function normalizeDeckName(name: string): string {
  return name
    .split("::")
    .map((part) =>
      part
        .normalize("NFC")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/gu, "")
        .replace(/^[\s:]+|[\s:]+$/gu, ""),
    )
    .join("::");
}

/** Comparison key for deck names: the normalized name, ignoring case. */
function deckNameKey(name: string): string {
  return normalizeDeckName(name).toLowerCase();
}
