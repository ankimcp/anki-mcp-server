import { Logger } from "@nestjs/common";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  validateMediaFilePath,
  validateMediaUrl,
  sanitizeMediaFilename,
  getMediaFilePathConfigFromEnv,
  getMediaUrlConfigFromEnv,
} from "@/mcp/utils/media-validation.utils";

const logger = new Logger("storeMediaFile");

/**
 * Parameters for storeMediaFile action
 */
export interface StoreMediaFileParams {
  /** Name of the file to store (e.g., "pronunciation.mp3", "image.jpg") */
  filename: string;

  /** Base64-encoded file content (alternative to path or url) */
  data?: string;

  /** Absolute path to file (alternative to data or url) */
  path?: string;

  /** URL to download file from (alternative to data or path) */
  url?: string;

  /** Whether to overwrite existing file with same name (default: true) */
  deleteExisting?: boolean;
}

/**
 * Result of storeMediaFile action
 */
export interface StoreMediaFileResult {
  success: boolean;
  filename: string;
  message: string;
  prefixedWithUnderscore: boolean;
}

/**
 * Store a media file in Anki's collection.media folder
 * Supports base64 data, file paths, or URLs
 */
export async function storeMediaFile(
  params: StoreMediaFileParams,
  client: AnkiConnectClient,
): Promise<StoreMediaFileResult> {
  const { data, path, url, deleteExisting = true } = params;

  // Validate that at least one source is provided
  if (!data && !path && !url) {
    throw new Error("Must provide either data, path, or url parameter");
  }

  // Validate that only one source is provided
  const sources = [data, path, url].filter(Boolean);
  if (sources.length > 1) {
    throw new Error(
      "Cannot provide multiple sources (data, path, url). Choose one.",
    );
  }

  // Validate filename
  if (!params.filename || params.filename.trim() === "") {
    throw new Error("Filename cannot be empty");
  }

  // Sanitize filename to prevent path traversal in output
  const filename = sanitizeMediaFilename(params.filename);

  // Validate file path if provided (MIME type allowlist + optional directory restriction)
  // Store the resolved path to send to AnkiConnect instead of the original unsanitized path
  let validatedPath: string | undefined;
  if (path) {
    const { resolvedPath, mimeType } = validateMediaFilePath(
      path,
      getMediaFilePathConfigFromEnv(),
    );
    validatedPath = resolvedPath;
    logger.warn(
      `storeMediaFile path validation: resolved="${resolvedPath}", mime="${mimeType}"`,
    );
  }

  // Validate URL if provided (SSRF prevention)
  if (url) {
    const { hostname, resolvedIp } = await validateMediaUrl(
      url,
      getMediaUrlConfigFromEnv(),
    );
    logger.warn(
      `storeMediaFile URL validation: hostname="${hostname}", resolvedIp="${resolvedIp}"`,
    );
  }

  // Check if filename starts with underscore (prevents Anki from removing unused media)
  const prefixedWithUnderscore = filename.startsWith("_");

  // Build AnkiConnect params
  const ankiParams: Record<string, any> = {
    filename,
    deleteExisting,
  };

  if (data) {
    ankiParams.data = data;
  } else if (validatedPath) {
    ankiParams.path = validatedPath;
  } else if (url) {
    ankiParams.url = url;
  }

  // Call AnkiConnect
  const result = await client.invoke<string>("storeMediaFile", ankiParams);

  // AnkiConnect returns the filename on success, or null on failure
  if (!result) {
    throw new Error("Failed to store media file");
  }

  return {
    success: true,
    filename: result,
    message: `Successfully stored media file: ${result}`,
    prefixedWithUnderscore,
  };
}
