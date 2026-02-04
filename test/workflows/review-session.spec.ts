import { Test, TestingModule } from "@nestjs/testing";
import { AnkiConnectClient } from "../../src/mcp/clients/anki-connect.client";
import { SyncTool } from "../../src/mcp/primitives/essential";
import { DeckActionsTool } from "../../src/mcp/primitives/essential";
import { GetDueCardsTool } from "../../src/mcp/primitives/essential";
import { PresentCardTool } from "../../src/mcp/primitives/essential";
import { RateCardTool } from "../../src/mcp/primitives/essential";
import { mockCards, mockDecks } from "../../src/test-fixtures/mock-data";
import {
  parseToolResult,
  createMockContext,
} from "../../src/test-fixtures/test-helpers";

jest.mock("../../src/mcp/clients/anki-connect.client");

describe("Review Session Workflow", () => {
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let syncTool: SyncTool;
  let deckActionsTool: DeckActionsTool;
  let getDueCardsTool: GetDueCardsTool;
  let presentCardTool: PresentCardTool;
  let rateCardTool: RateCardTool;
  let mockContext: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnkiConnectClient,
        SyncTool,
        DeckActionsTool,
        GetDueCardsTool,
        PresentCardTool,
        RateCardTool,
      ],
    }).compile();

    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    syncTool = module.get<SyncTool>(SyncTool);
    deckActionsTool = module.get<DeckActionsTool>(DeckActionsTool);
    getDueCardsTool = module.get<GetDueCardsTool>(GetDueCardsTool);
    presentCardTool = module.get<PresentCardTool>(PresentCardTool);
    rateCardTool = module.get<RateCardTool>(RateCardTool);

    mockContext = createMockContext();

    jest.clearAllMocks();
  });

  describe("Complete Review Session", () => {
    it("should complete a full review session workflow", async () => {
      // Step 1: Sync at the start
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "sync") {
            return null;
          }
          return null;
        },
      );

      const syncRawResult = await syncTool.sync({}, mockContext);
      const syncResult = parseToolResult(syncRawResult);
      expect(syncResult.success).toBe(true);
      expect(syncResult.message).toContain("Successfully synchronized");

      // Step 2: List available decks with stats using deckActions
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "deckNames") {
            return ["Spanish", "Japanese::JLPT N5"];
          }
          if (action === "getDeckStats") {
            return mockDecks.withStats;
          }
          return null;
        },
      );

      const decksRawResult = await deckActionsTool.execute(
        { action: "listDecks", includeStats: true },
        mockContext,
      );
      const decksResult = parseToolResult(decksRawResult);
      expect(decksResult.success).toBe(true);
      expect(decksResult.decks).toHaveLength(2);
      expect(decksResult.summary).toBeDefined();
      expect(decksResult.summary.review_cards).toBeGreaterThan(0);

      // Step 3: Get due cards from a specific deck
      const dueCardIds = [mockCards.dueCard.cardId, 1234567891, 1234567892];
      const cardsData = [
        mockCards.dueCard,
        {
          ...mockCards.dueCard,
          cardId: 1234567891,
          question: "¿Qué tal?",
          answer: "How are you doing?",
        },
        {
          ...mockCards.dueCard,
          cardId: 1234567892,
          question: "Adiós",
          answer: "Goodbye",
        },
      ];

      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "findCards") {
            return dueCardIds;
          }
          if (action === "cardsInfo") {
            return cardsData;
          }
          return null;
        },
      );

      const dueCardsRawResult = await getDueCardsTool.getDueCards(
        { deck_name: "Spanish" },
        mockContext,
      );
      const dueCardsResult = parseToolResult(dueCardsRawResult);
      expect(dueCardsResult.success).toBe(true);
      expect(dueCardsResult.cards).toHaveLength(3);
      expect(dueCardsResult.total).toBe(3);

      // Step 4: Present first card (question only)
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "cardsInfo") {
            return [cardsData[0]];
          }
          return null;
        },
      );

      const presentRawResult = await presentCardTool.presentCard(
        {
          card_id: dueCardIds[0],
          show_answer: false,
        },
        mockContext,
      );
      const presentResult = parseToolResult(presentRawResult);
      expect(presentResult.success).toBe(true);
      expect(presentResult.card.front).toBeDefined();
      expect(presentResult.card.back).toBeUndefined(); // Answer not shown yet
      expect(presentResult.instruction).toContain("Question shown");

      // Step 5: Show answer
      const presentWithAnswerRawResult = await presentCardTool.presentCard(
        {
          card_id: dueCardIds[0],
          show_answer: true,
        },
        mockContext,
      );
      const presentWithAnswerResult = parseToolResult(
        presentWithAnswerRawResult,
      );
      expect(presentWithAnswerResult.card.back).toBeDefined();
      expect(presentWithAnswerResult.instruction).toContain("Answer revealed");

      // Step 6: Rate the card
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "answerCards") {
            return true;
          }
          if (action === "cardsInfo") {
            // Return updated card info after rating
            return [
              {
                ...cardsData[0],
                interval: 4,
                due: Date.now() / 1000 + 4 * 24 * 60 * 60, // 4 days from now
              },
            ];
          }
          return null;
        },
      );

      const rateRawResult = await rateCardTool.rateCard(
        {
          card_id: dueCardIds[0],
          rating: 3, // Good
        },
        mockContext,
      );
      const rateResult = parseToolResult(rateRawResult);
      expect(rateResult.success).toBe(true);
      expect(rateResult.rating).toBe(3);
      expect(rateResult.message).toContain("successfully rated");

      // Step 7: Review remaining cards (simplified)
      for (let i = 1; i < dueCardIds.length; i++) {
        // Present card
        ankiClient.invoke.mockImplementation(
          async (action: string, _params?: any) => {
            if (action === "cardsInfo") {
              return [cardsData[i]];
            }
            return null;
          },
        );

        const cardRawResult = await presentCardTool.presentCard(
          {
            card_id: dueCardIds[i],
            show_answer: true,
          },
          mockContext,
        );
        const cardResult = parseToolResult(cardRawResult);
        expect(cardResult.success).toBe(true);

        // Rate card
        ankiClient.invoke.mockImplementation(
          async (action: string, _params?: any) => {
            if (action === "answerCards") {
              return true;
            }
            if (action === "cardsInfo") {
              return [
                {
                  ...cardsData[i],
                  interval: i + 1,
                  due: Date.now() / 1000 + (i + 1) * 24 * 60 * 60,
                },
              ];
            }
            return null;
          },
        );

        const rating = i % 2 === 0 ? 2 : 3; // Alternate between Hard and Good
        const ratingRawResult = await rateCardTool.rateCard(
          {
            card_id: dueCardIds[i],
            rating: rating,
          },
          mockContext,
        );
        const ratingResult = parseToolResult(ratingRawResult);
        expect(ratingResult.success).toBe(true);
      }

      // Step 8: Final sync at the end
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "sync") {
            return null;
          }
          return null;
        },
      );

      const finalSyncRawResult = await syncTool.sync({}, mockContext);
      const finalSyncResult = parseToolResult(finalSyncRawResult);
      expect(finalSyncResult.success).toBe(true);
    });

    it("should handle empty review queue gracefully", async () => {
      // Sync
      ankiClient.invoke.mockResolvedValueOnce(null);
      await syncTool.sync({}, mockContext);

      // Get due cards - none available
      ankiClient.invoke.mockImplementation(
        async (action: string, _params?: any) => {
          if (action === "findCards") {
            return []; // No due cards
          }
          return null;
        },
      );

      const dueCardsRawResult = await getDueCardsTool.getDueCards(
        { deck_name: "Spanish" },
        mockContext,
      );
      const dueCardsResult = parseToolResult(dueCardsRawResult);
      expect(dueCardsResult.success).toBe(true);
      expect(dueCardsResult.cards).toHaveLength(0);
      expect(dueCardsResult.message).toBe("No cards are due for review");

      // Final sync even with no reviews
      ankiClient.invoke.mockResolvedValueOnce(null);
      const finalSyncRawResult = await syncTool.sync({}, mockContext);
      const finalSyncResult = parseToolResult(finalSyncRawResult);
      expect(finalSyncResult.success).toBe(true);
    });

    it("should handle review with all decks", async () => {
      // Step 1: Sync
      ankiClient.invoke.mockResolvedValueOnce(null);
      await syncTool.sync({}, mockContext);

      // Step 2: Get due cards from all decks (no deckName parameter)
      const mixedDueCards = [
        mockCards.dueCard, // Spanish deck
        mockCards.newCard, // Japanese deck
      ];

      ankiClient.invoke.mockImplementation(
        async (action: string, params?: any) => {
          if (action === "findCards") {
            // When no deck specified, return cards from all decks
            expect(params?.query).toBe("is:due");
            return mixedDueCards.map((c) => c.cardId);
          }
          if (action === "cardsInfo") {
            return mixedDueCards;
          }
          return null;
        },
      );

      const allDueCardsRawResult = await getDueCardsTool.getDueCards(
        {}, // No deck specified
        mockContext,
      );
      const allDueCardsResult = parseToolResult(allDueCardsRawResult);
      expect(allDueCardsResult.success).toBe(true);
      expect(allDueCardsResult.cards).toHaveLength(2);

      // Check we have cards from different decks
      const decks = allDueCardsResult.cards.map((c: any) => c.deckName);
      expect(decks).toContain("Spanish");
      expect(decks).toContain("Japanese::JLPT N5");
    });

    it("should handle rating edge cases", async () => {
      // Test different rating scenarios
      const testCases = [
        { rating: 1, description: "Again - forgot the answer" },
        { rating: 2, description: "Hard - struggled but got it" },
        { rating: 3, description: "Good - normal recall" },
        { rating: 4, description: "Easy - instant recall" },
      ];

      for (const testCase of testCases) {
        ankiClient.invoke.mockImplementation(
          async (action: string, params?: any) => {
            if (action === "answerCards") {
              // Verify correct rating is sent
              expect(params?.answers[0].ease).toBe(testCase.rating);
              return true;
            }
            if (action === "cardsInfo") {
              // Return different intervals based on rating
              const baseInterval = testCase.rating === 1 ? 0 : testCase.rating;
              return [
                {
                  ...mockCards.dueCard,
                  interval: baseInterval,
                  due: Date.now() / 1000 + baseInterval * 24 * 60 * 60,
                },
              ];
            }
            return null;
          },
        );

        const rawResult = await rateCardTool.rateCard(
          {
            card_id: mockCards.dueCard.cardId,
            rating: testCase.rating,
          },
          mockContext,
        );
        const result = parseToolResult(rawResult);
        expect(result.success).toBe(true);
        expect(result.rating).toBe(testCase.rating);
      }
    });

    it("should track progress throughout review session", async () => {
      // Verify progress reporting is called at each step
      const progressCalls: any[] = [];
      const trackingContext = {
        reportProgress: jest.fn((progress) => {
          progressCalls.push(progress);
          return Promise.resolve();
        }),
        log: {
          debug: jest.fn(),
          error: jest.fn(),
          info: jest.fn(),
          warn: jest.fn(),
        },
        mcpServer: {} as any,
        mcpRequest: {} as any,
      };

      // Sync
      ankiClient.invoke.mockResolvedValueOnce(null);
      await syncTool.sync({}, trackingContext);
      expect(trackingContext.reportProgress).toHaveBeenCalled();

      // List decks using deckActions
      ankiClient.invoke
        .mockResolvedValueOnce(["Deck1"])
        .mockResolvedValueOnce({});
      await deckActionsTool.execute(
        { action: "listDecks", includeStats: true },
        trackingContext,
      );
      expect(trackingContext.reportProgress).toHaveBeenCalled();

      // Get due cards
      ankiClient.invoke
        .mockResolvedValueOnce([1, 2, 3])
        .mockResolvedValueOnce([mockCards.dueCard]);
      const rawTrackingResult = await getDueCardsTool.getDueCards(
        { deck_name: "Deck1" },
        trackingContext,
      );
      parseToolResult(rawTrackingResult); // Just parse to ensure it works
      expect(trackingContext.reportProgress).toHaveBeenCalled();

      // Verify progress values are sensible
      const progressValues = progressCalls.filter(
        (p) => p.progress !== undefined,
      );
      expect(progressValues.length).toBeGreaterThan(0);
      progressValues.forEach((p) => {
        expect(p.progress).toBeGreaterThanOrEqual(0);
        expect(p.progress).toBeLessThanOrEqual(100);
      });
    });
  });
});
