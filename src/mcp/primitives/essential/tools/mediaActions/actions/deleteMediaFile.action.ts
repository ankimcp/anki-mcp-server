import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { sanitizeMediaFilename } from "@/mcp/utils/media-validation.utils";

/**
 * Parameters for deleteMediaFile action
 */
export interface DeleteMediaFileParams {
  /** Name of the file to delete (e.g., "old_audio.mp3") */
  filename: string;
}

/**
 * Result of deleteMediaFile action
 */
export interface DeleteMediaFileResult {
  success: boolean;
  filename: string;
  message: string;
}

/**
 * Delete a media file from Anki's collection.media folder
 */
export async function deleteMediaFile(
  params: DeleteMediaFileParams,
  client: AnkiConnectClient,
): Promise<DeleteMediaFileResult> {
  // Validate filename
  if (!params.filename || params.filename.trim() === "") {
    throw new Error("Filename cannot be empty");
  }

  // Sanitize filename to prevent path traversal
  const filename = sanitizeMediaFilename(params.filename);

  // Call AnkiConnect
  await client.invoke<void>("deleteMediaFile", {
    filename,
  });

  return {
    success: true,
    filename,
    message: `Successfully deleted media file: ${filename}`,
  };
}
