import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Parameters for clearUnusedTags action
 * (no parameters needed)
 */
export type ClearUnusedTagsParams = Record<string, never>;

/**
 * Result of clearUnusedTags action
 */
export interface ClearUnusedTagsResult {
  success: boolean;
  message: string;
}

/**
 * Clear tags that are not used by any notes
 *
 * This is a cleanup operation that removes orphaned tags from the collection.
 * Useful after bulk tag operations or note deletions.
 *
 * @see https://git.sr.ht/~foosoft/anki-connect#clearunusedtags
 */
export async function clearUnusedTags(
  _params: ClearUnusedTagsParams,
  client: AnkiConnectClient,
): Promise<ClearUnusedTagsResult> {
  // Call AnkiConnect - clearUnusedTags returns null on success
  await client.invoke<null>("clearUnusedTags");

  return {
    success: true,
    message: "Successfully cleared unused tags from the collection",
  };
}
