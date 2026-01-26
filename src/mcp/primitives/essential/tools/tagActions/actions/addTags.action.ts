import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for addTags action
 */
export interface AddTagsParams {
  /** Array of note IDs to add tags to */
  notes: number[];

  /** Space-separated string of tags to add (e.g., "tag1 tag2 tag3") */
  tags: string;
}

/**
 * Result of addTags action
 */
export interface AddTagsResult {
  success: boolean;
  message: string;
  notesAffected: number;
  tagsAdded: string[];
}

/**
 * Add tags to specified notes
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#addtags
 */
export async function addTags(
  params: AddTagsParams,
  client: AnkiConnectClient,
): Promise<AddTagsResult> {
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

  // Call AnkiConnect - addTags returns null on success
  await client.invoke<null>("addTags", {
    notes,
    tags: trimmedTags,
  });

  return {
    success: true,
    message: `Successfully added ${tagList.length} tag(s) to ${notes.length} note(s)`,
    notesAffected: notes.length,
    tagsAdded: tagList,
  };
}
