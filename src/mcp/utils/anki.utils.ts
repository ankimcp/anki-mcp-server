/**
 * Anki utility functions for MCP tools
 */

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AnkiCard, CardRating, CardType } from "../types/anki.types";
import { AnkiConnectError } from "../clients/anki-connect.client";

/**
 * Helper function to clean HTML from card content
 */
export function cleanHtml(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "") // Remove style tags and content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "") // Remove script tags and content
    .replace(/<!--[\s\S]*?-->/g, "") // Remove comments
    .replace(/<[^>]*>/g, "") // Remove HTML tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n\s*\n/g, "\n") // Remove extra newlines
    .trim();
}

/**
 * Extract front and back content from Anki card fields
 */
export function extractCardContent(fields: AnkiCard["fields"]): {
  front: string;
  back: string;
} {
  let front = "";
  let back = "";

  if (!fields) {
    return { front, back };
  }

  // Common field names for different note types
  const frontFieldNames = ["Front", "正面", "Question", "Text"];
  const backFieldNames = ["Back", "背面", "Answer", "Extra", "Back Extra"];

  // Find front field
  for (const fieldName of frontFieldNames) {
    if (fields[fieldName]) {
      front = fields[fieldName].value;
      break;
    }
  }

  // Find back field
  for (const fieldName of backFieldNames) {
    if (fields[fieldName]) {
      back = fields[fieldName].value;
      break;
    }
  }

  // Fallback to first two fields if standard names not found
  if (!front && !back) {
    const fieldEntries = Object.entries(fields).sort(
      (a, b) => a[1].order - b[1].order,
    );
    if (fieldEntries.length > 0) {
      front = fieldEntries[0][1].value;
    }
    if (fieldEntries.length > 1) {
      back = fieldEntries[1][1].value;
    }
  }

  return {
    front: cleanHtml(front),
    back: cleanHtml(back),
  };
}

/**
 * Helper function to convert numeric card type to string
 */
export function getCardType(type: number): string {
  switch (type) {
    case CardType.New:
      return "new";
    case CardType.Learning:
      return "learning";
    case CardType.Review:
      return "review";
    case CardType.Relearning:
      return "relearning";
    default:
      return "unknown";
  }
}

/**
 * Determine note type based on model name
 */
export function getNoteType(modelName: string): string {
  const lowerName = modelName.toLowerCase();

  if (lowerName.includes("basic")) {
    if (lowerName.includes("reverse")) {
      return "Basic (and reversed card)";
    }
    return "Basic";
  }

  if (lowerName.includes("cloze")) {
    return "Cloze";
  }

  return "Custom";
}

/**
 * Get human-readable description of rating
 */
export function getRatingDescription(rating: number): string {
  switch (rating) {
    case CardRating.Again:
      return "Again (failed to recall)";
    case CardRating.Hard:
      return "Hard (recalled with difficulty)";
    case CardRating.Good:
      return "Good (recalled with some effort)";
    case CardRating.Easy:
      return "Easy (recalled instantly)";
    default:
      return "Unknown";
  }
}

/**
 * Create a standardized success response for MCP tools
 */
export function createSuccessResponse(data: any): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create a standardized error response for MCP tools
 */
export function createErrorResponse(
  error: unknown,
  context?: Record<string, any>,
): CallToolResult {
  const errorData: Record<string, any> = {
    success: false,
    error: error instanceof Error ? error.message : "Unknown error occurred",
  };

  // Add AnkiConnect-specific error details if available
  if (error instanceof AnkiConnectError) {
    if (error.action) {
      errorData.action = error.action;
    }
  }

  // Add any additional context
  if (context) {
    Object.assign(errorData, context);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(errorData, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Format interval for human readability
 */
export function formatInterval(days: number): string {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  if (days < 30) {
    return `${Math.round(days)} day${days !== 1 ? "s" : ""}`;
  }

  if (days < 365) {
    const months = Math.round(days / 30);
    return `${months} month${months !== 1 ? "s" : ""}`;
  }

  const years = Math.round((days / 365) * 10) / 10;
  return `${years} year${years !== 1 ? "s" : ""}`;
}

/**
 * Parse deck statistics from Anki response
 */
export function parseDeckStats(stats: any): {
  new_count: number;
  learn_count: number;
  review_count: number;
  total_cards: number;
} {
  return {
    new_count: stats.new_count || 0,
    learn_count: stats.lrn_count || 0,
    review_count: stats.rev_count || 0,
    total_cards: stats.total || 0,
  };
}
