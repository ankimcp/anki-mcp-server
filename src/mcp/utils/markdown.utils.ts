import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, RootContent } from "mdast";

/**
 * Parsed sections from a markdown document.
 * Each key corresponds to an H1 heading, and the value is the content under that heading.
 */
export interface MarkdownSections {
  [heading: string]: string;
}

/**
 * Converts an mdast node to its string representation.
 * Handles text nodes, inline code, and recursively processes children.
 */
function nodeToString(node: RootContent): string {
  if (node.type === "text") {
    return node.value;
  }
  if (node.type === "inlineCode") {
    return `\`${node.value}\``;
  }
  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => nodeToString(child as RootContent))
      .join("");
  }
  if ("value" in node && typeof node.value === "string") {
    return node.value;
  }
  return "";
}

/**
 * Extracts text content from a heading node.
 */
function extractHeadingText(node: RootContent): string {
  if ("children" in node && Array.isArray(node.children)) {
    return node.children
      .map((child) => nodeToString(child as RootContent))
      .join("");
  }
  return "";
}

/**
 * Parses markdown content and extracts sections by H1 headings.
 *
 * Example markdown:
 * ```markdown
 * # Description
 * This is the description section.
 *
 * # Content
 * This is the main content.
 * ```
 *
 * Result:
 * ```typescript
 * {
 *   "Description": "This is the description section.",
 *   "Content": "This is the main content."
 * }
 * ```
 *
 * @param markdown - The markdown string to parse
 * @returns An object where keys are H1 heading names and values are the content under each heading
 */
export function parseMarkdownSections(markdown: string): MarkdownSections {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const sections: MarkdownSections = {};

  // Only top-level H1 headings start sections; an H1 nested inside a
  // blockquote or list is ignored and stays part of the enclosing section's
  // body. Each body is sliced verbatim from the source so nested markdown
  // (sub-headings, lists, emphasis) is kept intact.
  const h1Headings = tree.children.filter(
    (node) => node.type === "heading" && node.depth === 1,
  );

  h1Headings.forEach((heading, index) => {
    const start = heading.position?.end.offset;
    const end =
      h1Headings[index + 1]?.position?.start.offset ?? markdown.length;
    if (start === undefined || end === undefined) {
      return;
    }
    sections[extractHeadingText(heading)] = markdown.slice(start, end).trim();
  });

  return sections;
}
