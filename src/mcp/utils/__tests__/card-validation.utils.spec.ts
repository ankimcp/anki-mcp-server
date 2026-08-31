import { Test, TestingModule } from "@nestjs/testing";
import {
  assertCardIdsExist,
  fetchExistingCards,
  MissingCardIdsError,
} from "@/mcp/utils/card-validation.utils";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

jest.mock("@/mcp/clients/anki-connect.client");

describe("card-validation.utils", () => {
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AnkiConnectClient],
    }).compile();

    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  describe("fetchExistingCards", () => {
    it("should resolve with cardsInfo when every card exists", async () => {
      const cards = [111, 222];
      ankiClient.invoke.mockResolvedValueOnce([
        { cardId: 111, interval: 10 },
        { cardId: 222, interval: 20 },
      ]);

      const result = await fetchExistingCards(cards, ankiClient, "No-op.");

      expect(ankiClient.invoke).toHaveBeenCalledWith("cardsInfo", { cards });
      expect(result).toEqual([
        { cardId: 111, interval: 10 },
        { cardId: 222, interval: 20 },
      ]);
    });

    it("should report missing IDs positionally", async () => {
      const cards = [111, 222, 333];
      ankiClient.invoke.mockResolvedValueOnce([
        { cardId: 111 },
        {},
        { cardId: 333 },
      ]);

      await expect(
        fetchExistingCards(cards, ankiClient, "No cards were changed."),
      ).rejects.toMatchObject(
        new MissingCardIdsError([222], 3, "No cards were changed."),
      );
    });

    it("should treat an entry with a non-numeric cardId as missing", async () => {
      const cards = [111];
      ankiClient.invoke.mockResolvedValueOnce([{ cardId: "111" as never }]);

      await expect(
        fetchExistingCards(cards, ankiClient, "No-op."),
      ).rejects.toThrow(MissingCardIdsError);
    });

    it("should truncate the missing-IDs message past 10 entries", async () => {
      const cards = Array.from({ length: 25 }, (_, i) => i + 1);
      ankiClient.invoke.mockResolvedValueOnce(cards.map(() => ({})));

      await expect(
        fetchExistingCards(cards, ankiClient, "No-op."),
      ).rejects.toThrow(/and 15 more/);
    });
  });

  describe("assertCardIdsExist", () => {
    it("should resolve without throwing when every card exists", async () => {
      const cards = [111, 222];
      ankiClient.invoke.mockResolvedValueOnce([
        { cardId: 111, mod: 1 },
        { cardId: 222, mod: 2 },
      ]);

      await expect(
        assertCardIdsExist(cards, ankiClient, "No-op."),
      ).resolves.toBeUndefined();
      expect(ankiClient.invoke).toHaveBeenCalledWith("cardsModTime", {
        cards,
      });
    });

    it("should report missing IDs positionally", async () => {
      const cards = [111, 222];
      ankiClient.invoke.mockResolvedValueOnce([{ cardId: 111, mod: 1 }, {}]);

      await expect(
        assertCardIdsExist(cards, ankiClient, "No cards were rescheduled."),
      ).rejects.toMatchObject(
        new MissingCardIdsError([222], 2, "No cards were rescheduled."),
      );
    });

    it("should treat an entry with a non-numeric cardId as missing", async () => {
      const cards = [111];
      ankiClient.invoke.mockResolvedValueOnce([
        { cardId: "111" as never, mod: 1 },
      ]);

      await expect(
        assertCardIdsExist(cards, ankiClient, "No-op."),
      ).rejects.toThrow(MissingCardIdsError);
    });

    it("should truncate the missing-IDs message past 10 entries", async () => {
      const cards = Array.from({ length: 25 }, (_, i) => i + 1);
      ankiClient.invoke.mockResolvedValueOnce(cards.map(() => ({})));

      await expect(
        assertCardIdsExist(cards, ankiClient, "No-op."),
      ).rejects.toThrow(/and 15 more/);
    });
  });
});
