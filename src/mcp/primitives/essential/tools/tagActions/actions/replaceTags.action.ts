import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for replaceTags action
 */
export interface ReplaceTagsParams {
  /** Array of note IDs to replace tags in */
  notes: number[];

  /** Tag to search for and replace */
  tagToReplace: string;

  /** Tag to replace with */
  replaceWithTag: string;
}

/**
 * Result of replaceTags action
 */
export interface ReplaceTagsResult {
  success: boolean;
  message: string;
  notesAffected: number;
  tagToReplace: string;
  replaceWithTag: string;
}

/**
 * Replace a tag with another tag in specified notes
 *
 * This is useful for renaming tags (e.g., "RomanEmpire" -> "roman-empire")
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#replacetags
 */
export async function replaceTags(
  params: ReplaceTagsParams,
  client: AnkiConnectClient,
): Promise<ReplaceTagsResult> {
  const { notes, tagToReplace, replaceWithTag } = params;

  // Validate notes array
  if (!notes || notes.length === 0) {
    throw new Error("notes array cannot be empty");
  }

  // Validate tagToReplace
  if (!tagToReplace || tagToReplace.trim() === "") {
    throw new Error("tagToReplace cannot be empty");
  }

  // Validate replaceWithTag
  if (!replaceWithTag || replaceWithTag.trim() === "") {
    throw new Error("replaceWithTag cannot be empty");
  }

  const trimmedOld = tagToReplace.trim();
  const trimmedNew = replaceWithTag.trim();

  // Validate no spaces in tags (single tag only)
  if (trimmedOld.includes(" ") || trimmedNew.includes(" ")) {
    throw new Error("Tags cannot contain spaces. Use single tags only.");
  }

  // Call AnkiConnect - replaceTags returns null on success
  await client.invoke<null>("replaceTags", {
    notes,
    tag_to_replace: trimmedOld,
    replace_with_tag: trimmedNew,
  });

  return {
    success: true,
    message: `Successfully replaced "${trimmedOld}" with "${trimmedNew}" in ${notes.length} note(s)`,
    notesAffected: notes.length,
    tagToReplace: trimmedOld,
    replaceWithTag: trimmedNew,
  };
}
