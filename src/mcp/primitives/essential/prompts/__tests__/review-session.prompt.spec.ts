import { ReviewSessionPrompt } from "../review-session.prompt";

describe("ReviewSessionPrompt", () => {
  let prompt: ReviewSessionPrompt;

  beforeEach(() => {
    prompt = new ReviewSessionPrompt();
  });

  describe("getAnkiReviewPrompt", () => {
    it("should return structured prompt with messages array", () => {
      const result = prompt.getAnkiReviewPrompt();

      expect(result).toHaveProperty("description");
      expect(result).toHaveProperty("messages");
      expect(result.description).toBeTruthy();
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages).toHaveLength(1);
    });

    it("should have correct message structure", () => {
      const result = prompt.getAnkiReviewPrompt();
      const message = result.messages[0];

      expect(message).toHaveProperty("role");
      expect(message.role).toBe("user");
      expect(message).toHaveProperty("content");
      expect(message.content).toHaveProperty("type");
      expect(message.content.type).toBe("text");
      expect(message.content).toHaveProperty("text");
      expect(typeof message.content.text).toBe("string");
    });

    it("should offer syncing at session start and end rather than mandate it", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      expect(text).toContain("Syncing with AnkiWeb");
      expect(text).toContain("Offer to sync with AnkiWeb");
      expect(text).not.toContain("ALWAYS sync");
      expect(text).toContain("At Session Start");
      expect(text).toContain("At Session End");
    });

    it("should include review workflow steps", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      expect(text).toContain("Review Workflow");
      expect(text).toContain("Offer a Sync");
      expect(text).toContain("Ask About Deck Selection");
      expect(text).toContain("Present the Question");
      expect(text).toContain("Wait for User's Answer");
      expect(text).toContain("Show the Answer");
      expect(text).toContain("Evaluate Performance");
      expect(text).toContain("Suggest a Rating");
    });

    it("should include rating confirmation workflow", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      expect(text).toContain("Confirm the Rating with the User");
      expect(text).toContain("depending on the user's response");
      expect(text).toContain("Submit Rating");
    });

    it("should include rating scale (1-4)", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      expect(text).toContain("1 (Again)");
      expect(text).toContain("2 (Hard)");
      expect(text).toContain("3 (Good)");
      expect(text).toContain("4 (Easy)");
    });

    it("should include example interactions", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      expect(text).toContain("Example Interactions");
      expect(text).toContain("User agrees with suggestion");
      expect(text).toContain("User overrides suggestion");
      expect(text).toContain("User provides specific rating");
    });

    it("should include key principles", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      expect(text).toContain("Key Principles");
      expect(text).toContain("Ratings come from the user");
      expect(text).toContain("Accept user's self-assessment");
    });

    it("should have non-empty description", () => {
      const result = prompt.getAnkiReviewPrompt();

      expect(result.description).toBe(
        "Guidelines for conducting Anki spaced repetition review sessions",
      );
    });

    it("should have substantial prompt text content", () => {
      const result = prompt.getAnkiReviewPrompt();
      const text = result.messages[0].content.text;

      // Verify prompt has substantial content (more than just a few lines)
      expect(text.length).toBeGreaterThan(500);
      expect(text.split("\n").length).toBeGreaterThan(20);
    });
  });
});
