import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for removeTags action
 */
export interface RemoveTagsParams {
  /** Array of note IDs to remove tags from */
  notes: number[];

  /** Space-separated string of tags to remove (e.g., "tag1 tag2 tag3") */
  tags: string;
}

/**
 * Result of removeTags action
 */
export interface RemoveTagsResult {
  success: boolean;
  message: string;
  notesAffected: number;
  tagsRemoved: string[];
}

/**
 * Remove tags from specified notes
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#removetags
 */
export async function removeTags(
  params: RemoveTagsParams,
  client: AnkiConnectClient,
): Promise<RemoveTagsResult> {
  const { notes, tags } = params;

  // Validate notes array
  if (!notes || notes.length === 0) {
    throw new Error("notes array cannot be empty");
  }

  // Validate tags string
  if (!tags || tags.trim() === "") {
    throw new Error("tags string cannot be empty");
  }

  const trimmedTags = tags.trim();
  const tagList = trimmedTags.split(/\s+/).filter(Boolean);

  // Call AnkiConnect - removeTags returns null on success
  await client.invoke<null>("removeTags", {
    notes,
    tags: trimmedTags,
  });

  return {
    success: true,
    message: `Successfully removed ${tagList.length} tag(s) from ${notes.length} note(s)`,
    notesAffected: notes.length,
    tagsRemoved: tagList,
  };
}
