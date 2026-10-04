import * as fs from "fs";
import * as path from "path";
import { parseMarkdownSections } from "../markdown.utils";

const countOccurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

describe("parseMarkdownSections", () => {
  it("splits a document into sections keyed by H1 heading", () => {
    const sections = parseMarkdownSections(
      "# Description\n\nThis is the description section.\n\n# Content\n\nThis is the main content.\n",
    );

    expect(sections).toEqual({
      Description: "This is the description section.",
      Content: "This is the main content.",
    });
  });

  it("does not emit the heading text or nested text more than once", () => {
    const sections = parseMarkdownSections(
      "# Content\n\nA paragraph with **bold words** and `code`.\n\n- first item\n- second item\n",
    );

    const content = sections.Content;
    expect(content.startsWith("Content")).toBe(false);
    expect(countOccurrences(content, "bold words")).toBe(1);
    expect(countOccurrences(content, "first item")).toBe(1);
    expect(countOccurrences(content, "second item")).toBe(1);
  });

  it("keeps nested markdown structure verbatim", () => {
    const body =
      "## Sub heading\n\n**Bold line.**\n- item one\n- item two\n\n```\n# not a heading\n```";
    const sections = parseMarkdownSections(`# Content\n\n${body}\n`);

    expect(sections.Content).toBe(body);
  });

  it("ignores text before the first H1", () => {
    const sections = parseMarkdownSections("Preamble\n\n# Only\n\nBody\n");

    expect(sections).toEqual({ Only: "Body" });
  });

  describe("twenty_rules prompt content", () => {
    const markdown = fs.readFileSync(
      path.join(
        __dirname,
        "../../primitives/essential/prompts/twenty-rules.prompt/content.md",
      ),
      "utf-8",
    );
    const sections = parseMarkdownSections(markdown);

    it("yields a single-sentence description", () => {
      expect(sections.Description).toBe(
        "Twenty rules of formulating knowledge for effective Anki flashcard creation based on Dr. Piotr Wozniak's SuperMemo research",
      );
    });

    it("does not duplicate content", () => {
      const totalLength = Object.values(sections).reduce(
        (sum, text) => sum + text.length,
        0,
      );
      expect(totalLength).toBeLessThanOrEqual(markdown.length);
      expect(
        countOccurrences(
          sections.Content,
          "Each card should test ONE piece of information.",
        ),
      ).toBe(1);
      expect(
        countOccurrences(sections.Content, "### 4. Stick to the Minimum"),
      ).toBe(1);
    });
  });
});
