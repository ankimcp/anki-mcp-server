/**
 * Anki utility functions for MCP tools
 */

import { CallToolResult } from "@modelcontextprotocol/server";
import { AnkiCard, CardRating, CardType } from "../types/anki.types";
import { AnkiConnectError } from "../clients/anki-connect.client";

/**
 * Matches Anki's answer separator that most back templates emit right after
 * `{{FrontSide}}`. Matches any `<hr>` carrying an `id=answer` attribute
 * regardless of quoting (`id=answer`, `id="answer"`, `id='answer'`) or where the
 * attribute sits among others (e.g. `<hr class="sep" id=answer>`). Bounded by
 * `[^>]*` so it stays linear (no catastrophic backtracking).
 */
const ANSWER_SEPARATOR_REGEX = /<hr\b[^>]*\bid=["']?answer["']?[^>]*>/i;

/**
 * Clean rendered card HTML down to readable plain text.
 *
 * Strips `<style>`/`<script>` blocks (including their contents, which rendered
 * cards can embed), converts line-break/block tags to newlines, removes the
 * remaining tags, decodes common HTML entities, and collapses excess
 * whitespace. Anki media markers like `[sound:...]` and cloze-rendered text are
 * left untouched.
 */
export function cleanHtml(html: string): string {
  if (!html) {
    return "";
  }

  return (
    html
      // Drop <style>/<script> blocks entirely — their inner text is not content.
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      // Convert line-break and block-closing tags to newlines.
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:div|p)>/gi, "\n")
      // Remove all remaining tags. (Runs before entity decoding so that decoded
      // "<"/">" can't be mistaken for real tags.)
      .replace(/<[^>]*>/g, "")
      // Decode common HTML entities. `&amp;` is resolved LAST so double-encoded
      // input like `&amp;lt;` stays `&lt;` instead of chaining into `<`.
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      // Collapse excess whitespace while preserving intentional line breaks.
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{2,}/g, "\n")
      .trim()
  );
}

/**
 * Extract front and back text from a card's *rendered* output.
 *
 * Unlike field-based extraction, this uses AnkiConnect's per-card `question`
 * and `answer` HTML (from `cardsInfo`), so it honors the card's template
 * ordinal — reversed, cloze, and custom-template cards all render correctly.
 *
 * The rendered answer normally begins with the question (via `{{FrontSide}}`)
 * followed by `<hr id=answer>`. When that marker is present we keep only the
 * part after it so the back isn't a duplicate of the front; otherwise the whole
 * cleaned answer is used.
 */
export function extractRenderedCardContent(
  card: Pick<AnkiCard, "question" | "answer">,
): { front: string; back: string } {
  const question = card.question ?? "";
  const answer = card.answer ?? "";

  const separatorMatch = answer.match(ANSWER_SEPARATOR_REGEX);
  const backHtml =
    separatorMatch && separatorMatch.index !== undefined
      ? answer.slice(separatorMatch.index + separatorMatch[0].length)
      : answer;

  return {
    front: cleanHtml(question),
    back: cleanHtml(backHtml),
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
