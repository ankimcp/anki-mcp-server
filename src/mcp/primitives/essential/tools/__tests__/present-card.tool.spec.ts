import { Test, TestingModule } from "@nestjs/testing";
import { PresentCardTool } from "../present-card.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { mockCards } from "../../../../../test-fixtures/mock-data";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";
import { AnkiCard } from "../../../../types/anki.types";

// Mock the AnkiConnectClient
jest.mock("../../../../clients/anki-connect.client");

describe("PresentCardTool", () => {
  let tool: PresentCardTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  const sharedFields = {
    Front: { value: "こんにちは", order: 0 },
    Back: { value: "Hello", order: 1 },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PresentCardTool, AnkiConnectClient],
    }).compile();

    tool = module.get<PresentCardTool>(PresentCardTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    jest.clearAllMocks();
  });

  describe("presentCard", () => {
    it("returns the question only when show_answer is false", async () => {
      const card: AnkiCard = {
        ...mockCards.dueCard,
        fields: {
          Front: { value: "¿Cómo estás?", order: 0 },
          Back: { value: "How are you?", order: 1 },
        },
      };
      ankiClient.invoke
        .mockResolvedValueOnce([card])
        .mockResolvedValueOnce([{ noteId: card.note, tags: [] }]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: card.cardId, show_answer: false }),
      );

      expect(result.success).toBe(true);
      expect(result.card.front).toBe("¿Cómo estás?");
      expect(result.card.back).toBeUndefined();
      expect(result.instruction).toContain("Question only");
    });

    it("returns the note's tags from notesInfo", async () => {
      const card: AnkiCard = { ...mockCards.dueCard, fields: sharedFields };
      ankiClient.invoke
        .mockResolvedValueOnce([card])
        .mockResolvedValueOnce([
          { noteId: card.note, tags: ["spanish", "greetings"] },
        ]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: card.cardId, show_answer: false }),
      );

      expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "cardsInfo", {
        cards: [card.cardId],
      });
      expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "notesInfo", {
        notes: [card.note],
      });
      expect(ankiClient.invoke).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.card.tags).toEqual(["spanish", "greetings"]);
    });

    it("returns an empty tags array for a note without tags", async () => {
      const card: AnkiCard = { ...mockCards.dueCard, fields: sharedFields };
      ankiClient.invoke
        .mockResolvedValueOnce([card])
        .mockResolvedValueOnce([{ noteId: card.note, tags: [] }]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: card.cardId, show_answer: false }),
      );

      expect(result.success).toBe(true);
      expect(result.card.tags).toEqual([]);
    });

    it("still presents the card without tags when notesInfo fails", async () => {
      const card: AnkiCard = { ...mockCards.dueCard, fields: sharedFields };
      ankiClient.invoke
        .mockResolvedValueOnce([card])
        .mockRejectedValueOnce(new Error("fetch failed"));

      const result = parseToolResult(
        await tool.presentCard({ card_id: card.cardId, show_answer: true }),
      );

      expect(result.success).toBe(true);
      expect(result.card.front).toBe("¿Cómo estás?");
      expect(result.card.back).toBe("How are you?");
      expect(result.card).not.toHaveProperty("tags");
    });

    it("presents the card without tags when notesInfo has no such note", async () => {
      const card: AnkiCard = { ...mockCards.dueCard, fields: sharedFields };
      // AnkiConnect returns an empty object for a missing note id.
      ankiClient.invoke
        .mockResolvedValueOnce([card])
        .mockResolvedValueOnce([{}]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: card.cardId, show_answer: false }),
      );

      expect(result.success).toBe(true);
      expect(result.card).not.toHaveProperty("tags");
    });

    it("splits the rendered answer on the <hr id=answer> marker", async () => {
      const card: AnkiCard = {
        ...mockCards.dueCard,
        fields: {
          Front: { value: "¿Cómo estás?", order: 0 },
          Back: { value: "How are you?", order: 1 },
        },
      };
      ankiClient.invoke
        .mockResolvedValueOnce([card])
        .mockResolvedValueOnce([{ noteId: card.note, tags: ["spanish"] }]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: card.cardId, show_answer: true }),
      );

      expect(result.success).toBe(true);
      expect(result.card.front).toBe("¿Cómo estás?");
      // Back must not duplicate the front (which the raw answer embeds).
      expect(result.card.back).toBe("How are you?");
      expect(result.card.tags).toEqual(["spanish"]);
      expect(result.instruction).toContain("Answer included");
    });

    it("renders the reversed card of a multi-card note per its ordinal", async () => {
      const reversed: AnkiCard = {
        ...mockCards.reversedBackward,
        fields: sharedFields,
      };
      ankiClient.invoke
        .mockResolvedValueOnce([reversed])
        .mockResolvedValueOnce([{ noteId: reversed.note, tags: ["japanese"] }]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: reversed.cardId, show_answer: true }),
      );

      expect(result.success).toBe(true);
      // ord 1 renders Back->Front: question is the English side.
      expect(result.card.front).toBe("Hello");
      expect(result.card.back).toBe("こんにちは");
      expect(result.card.tags).toEqual(["japanese"]);
    });

    it("returns an error when the card is not found", async () => {
      ankiClient.invoke.mockResolvedValueOnce([]);

      const result = parseToolResult(
        await tool.presentCard({ card_id: 999, show_answer: false }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.cardId).toBe(999);
    });

    it("returns an error without calling notesInfo when cardsInfo returns an empty object", async () => {
      // AnkiConnect returns [{}] for an unknown card id.
      ankiClient.invoke.mockResolvedValueOnce([{}]);

      const rawResult = await tool.presentCard({
        card_id: 999,
        show_answer: false,
      });
      const result = parseToolResult(rawResult);

      expect(rawResult).toHaveProperty("isError", true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
      expect(result.cardId).toBe(999);
      expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
      expect(ankiClient.invoke).not.toHaveBeenCalledWith(
        "notesInfo",
        expect.anything(),
      );
    });

    it("handles AnkiConnect errors gracefully", async () => {
      ankiClient.invoke.mockRejectedValueOnce(new Error("fetch failed"));

      const result = parseToolResult(
        await tool.presentCard({ card_id: 123, show_answer: false }),
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("fetch failed");
    });
  });
});
