import { Scope } from "@nestjs/common";
import { McpController, Prompt } from "@rekog/mcp-nest";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { parseMarkdownSections } from "@/mcp/utils/markdown.utils";

// Module-level caching: This runs ONCE when the module is first loaded
// Subsequent calls to getTwentyRulesPrompt() use the cached content
const PROMPT_SECTIONS = (() => {
  const markdownPath = path.join(__dirname, "content.md");
  const markdown = fs.readFileSync(markdownPath, "utf-8");
  return parseMarkdownSections(markdown);
})();

@McpController({ scope: Scope.REQUEST })
export class TwentyRulesPrompt {
  @Prompt({
    name: "twenty_rules",
    description:
      PROMPT_SECTIONS.Description ||
      "Twenty rules of formulating knowledge for effective Anki flashcard creation",
    parameters: z.object({}),
  })
  getTwentyRulesPrompt() {
    return {
      description:
        PROMPT_SECTIONS.Description ||
        "Twenty rules of formulating knowledge for effective Anki flashcard creation",
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: PROMPT_SECTIONS.Content || "",
          },
        },
      ],
    };
  }
}
