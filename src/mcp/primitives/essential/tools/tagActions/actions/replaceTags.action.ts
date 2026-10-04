import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import type { NoteInfo } from "@/mcp/types/anki.types";

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
    throw new Error(
      "Tags cannot contain spaces; tagToReplace and replaceWithTag each take a single tag.",
    );
  }

  // AnkiConnect only touches notes that carry the tag (matched case-insensitively)
  // and silently skips missing note IDs, so count those up front.
  const notesInfo = await client.invoke<Array<Partial<NoteInfo>>>("notesInfo", {
    notes,
  });
  const oldTagLower = trimmedOld.toLowerCase();
  const notesWithTag = new Set(
    notesInfo
      .filter(
        (note) =>
          note?.noteId !== undefined &&
          note.tags?.some((tag) => tag.toLowerCase() === oldTagLower),
      )
      .map((note) => note.noteId),
  );
  const notesAffected = notesWithTag.size;

  // Call AnkiConnect - replaceTags returns null on success
  await client.invoke<null>("replaceTags", {
    notes,
    tag_to_replace: trimmedOld,
    replace_with_tag: trimmedNew,
  });

  return {
    success: true,
    message:
      notesAffected === 0
        ? `No note among the ${notes.length} given carried "${trimmedOld}"; nothing was replaced`
        : `Successfully replaced "${trimmedOld}" with "${trimmedNew}" in ${notesAffected} of ${notes.length} note(s)`,
    notesAffected,
    tagToReplace: trimmedOld,
    replaceWithTag: trimmedNew,
  };
}
