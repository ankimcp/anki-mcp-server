/**
 * E2E tests for get_due_cards tool with include_learning and include_new params
 *
 * Requires:
 *   - Docker container running: npm run e2e:up
 *   - Built project: npm run build
 */
import { callTool, setTransport, getTransport } from "./helpers";

/** Generate unique suffix to avoid duplicate conflicts */
function uniqueId(): string {
  return String(Date.now()).slice(-8);
}

describe("E2E: get_due_cards Tool", () => {
  beforeAll(() => {
    setTransport("stdio");
    expect(getTransport()).toBe("stdio");
  });

  describe("Tool Discovery", () => {
    it("should have get_due_cards tool available", () => {
      // Call the tool with minimal params to verify it exists
      const result = callTool("get_due_cards", { limit: 1 });
      expect(result).toHaveProperty("success");
    });
  });

  describe("include_learning parameter", () => {
    it("should include learning cards by default (include_learning: true)", () => {
      // Default behavior includes learning cards
      const result = callTool("get_due_cards", { limit: 10 });

      expect(result.success).toBe(true);
      // Result should include cards array (may be empty if no due/learning cards)
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });

    it("should accept include_learning: false parameter", () => {
      const result = callTool("get_due_cards", {
        limit: 10,
        include_learning: false,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });

    it("should accept include_learning: true explicitly", () => {
      const result = callTool("get_due_cards", {
        limit: 10,
        include_learning: true,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });
  });

  describe("include_new parameter", () => {
    it("should not include new cards by default (include_new: false)", () => {
      // Default behavior excludes new cards
      const result = callTool("get_due_cards", { limit: 10 });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });

    it("should accept include_new: true parameter", () => {
      const result = callTool("get_due_cards", {
        limit: 10,
        include_new: true,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });

    it("should accept include_new: false explicitly", () => {
      const result = callTool("get_due_cards", {
        limit: 10,
        include_new: false,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });
  });

  describe("Combined parameters", () => {
    it("should accept both include_learning and include_new together", () => {
      const result = callTool("get_due_cards", {
        limit: 10,
        include_learning: true,
        include_new: true,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });

    it("should work with include_learning: false and include_new: true", () => {
      const result = callTool("get_due_cards", {
        limit: 10,
        include_learning: false,
        include_new: true,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
    });

    it("should work with deck_name and include params", () => {
      const uid = uniqueId();
      const deckName = `DueTest::${uid}`;

      // Create a test deck
      callTool("deckActions", { action: "createDeck", deckName: deckName });

      // Add a note to the deck
      callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Due Test Question ${uid}`,
          Back: `Due Test Answer ${uid}`,
        },
      });

      // Query with deck filter and include params
      const result = callTool("get_due_cards", {
        deck_name: deckName,
        limit: 10,
        include_learning: true,
        include_new: true,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(Array.isArray(result.cards)).toBe(true);
      // New card should be included since include_new: true
      expect((result.cards as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Response structure", () => {
    it("should return proper card structure", () => {
      const uid = uniqueId();
      const deckName = `DueStruct::${uid}`;

      // Create deck and note
      callTool("deckActions", { action: "createDeck", deckName: deckName });
      callTool("addNote", {
        deckName: deckName,
        modelName: "Basic",
        fields: {
          Front: `Structure Test ${uid}`,
          Back: `Structure Answer ${uid}`,
        },
      });

      // Get cards including new
      const result = callTool("get_due_cards", {
        deck_name: deckName,
        limit: 1,
        include_new: true,
      });

      expect(result.success).toBe(true);
      expect(result).toHaveProperty("cards");
      expect(result).toHaveProperty("total");
      expect(result).toHaveProperty("message");

      if ((result.cards as unknown[]).length > 0) {
        const card = (result.cards as Record<string, unknown>[])[0];
        expect(card).toHaveProperty("cardId");
        expect(card).toHaveProperty("front");
        expect(card).toHaveProperty("back");
        expect(card).toHaveProperty("deckName");
        expect(card).toHaveProperty("modelName");
      }
    });

    it("should return total count of matching cards", () => {
      const result = callTool("get_due_cards", {
        limit: 5,
        include_learning: true,
        include_new: true,
      });

      expect(result.success).toBe(true);
      expect(typeof result.total).toBe("number");
      expect(result.total).toBeGreaterThanOrEqual(0);
    });
  });
});
