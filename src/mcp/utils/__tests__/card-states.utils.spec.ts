import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  deckScopeQuery,
  emptyCardStateCounts,
  fetchCardStateCounts,
} from "@/mcp/utils/card-states.utils";

jest.mock("@/mcp/clients/anki-connect.client");

/**
 * These expectations are HARDCODED on purpose. They are the authoritative pin
 * for the search semantics documented in `card-states.utils.ts` — asserting
 * against a shared constant would be self-referential and would let a bad edit
 * sail through both sides at once.
 *
 * Reference: https://docs.ankiweb.net/searching.html#card-state and Anki's
 * `rslib/src/search/sqlwriter.rs` (`write_state`), where `is:new`/`is:learn`/
 * `is:review` are card-TYPE predicates (hence the explicit
 * `-is:suspended -is:buried`) and `is:learn`/`is:review` overlap on relearning
 * cards (hence `-is:learn` on the review filter).
 */
const EXPECTED_FILTERS = [
  "is:new -is:suspended -is:buried",
  "is:learn -is:suspended -is:buried",
  "is:review -is:learn -is:suspended -is:buried",
  "is:suspended",
  "is:buried",
];

describe("card-states.utils", () => {
  let client: jest.Mocked<AnkiConnectClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new (
      AnkiConnectClient as jest.Mock
    )() as jest.Mocked<AnkiConnectClient>;
  });

  /** Collect the `query` of every `findCards` call, in order. */
  function issuedQueries(): string[] {
    return client.invoke.mock.calls
      .filter(([action]) => action === "findCards")
      .map(([, params]) => (params as { query: string }).query);
  }

  describe("deckScopeQuery", () => {
    it("wraps a plain deck name in a quoted deck: term", () => {
      expect(deckScopeQuery("German")).toBe('"deck:German"');
    });

    it("keeps :: separators unescaped so subdeck names still resolve", () => {
      // Colons after the first one belong to the value, so escaping them would
      // break every `Parent::Child` deck.
      expect(deckScopeQuery("Japanese::JLPT N5")).toBe(
        '"deck:Japanese::JLPT N5"',
      );
    });

    it('escapes double quotes: Say "hi"', () => {
      expect(deckScopeQuery('Say "hi"')).toBe('"deck:Say \\"hi\\""');
    });

    it("escapes the _ wildcard so JLPT_N5 cannot match siblings", () => {
      // Unescaped, `_` matches any single character — `JLPT_N5` would also
      // match a sibling deck named `JLPT-N5`.
      expect(deckScopeQuery("JLPT_N5")).toBe('"deck:JLPT\\_N5"');
    });

    it("escapes the * wildcard", () => {
      expect(deckScopeQuery("A*B")).toBe('"deck:A\\*B"');
    });

    it("escapes backslashes so the term stays a valid escape sequence", () => {
      // Unescaped, `\P` is an invalid escape and AnkiConnect rejects the search.
      expect(deckScopeQuery("Math\\Physics")).toBe('"deck:Math\\\\Physics"');
    });

    it("escapes every special character in one pass without double-escaping", () => {
      expect(deckScopeQuery('a\\b"c*d_e')).toBe('"deck:a\\\\b\\"c\\*d\\_e"');
    });
  });

  describe("fetchCardStateCounts", () => {
    it("issues the five state searches in a fixed order, unscoped", async () => {
      client.invoke.mockResolvedValue([]);

      await fetchCardStateCounts(client);

      expect(issuedQueries()).toEqual(EXPECTED_FILTERS);
    });

    it("prefixes every search with the supplied scope", async () => {
      client.invoke.mockResolvedValue([]);

      await fetchCardStateCounts(client, deckScopeQuery("German"));

      expect(issuedQueries()).toEqual([
        '"deck:German" is:new -is:suspended -is:buried',
        '"deck:German" is:learn -is:suspended -is:buried',
        '"deck:German" is:review -is:learn -is:suspended -is:buried',
        '"deck:German" is:suspended',
        '"deck:German" is:buried',
      ]);
    });

    it("maps each search result onto its own state", async () => {
      client.invoke.mockImplementation((_action: string, params?: any) => {
        const byQuery: Record<string, number[]> = {
          "is:new -is:suspended -is:buried": [1, 2, 3],
          "is:learn -is:suspended -is:buried": [4, 5],
          "is:review -is:learn -is:suspended -is:buried": [6, 7, 8, 9],
          "is:suspended": [10],
          "is:buried": [11, 12],
        };
        return Promise.resolve(byQuery[params.query] ?? []);
      });

      await expect(fetchCardStateCounts(client)).resolves.toEqual({
        new: 3,
        learning: 2,
        review: 4,
        suspended: 1,
        buried: 2,
      });
    });

    it("returns zeros when every search comes back empty", async () => {
      client.invoke.mockResolvedValue([]);

      await expect(fetchCardStateCounts(client)).resolves.toEqual(
        emptyCardStateCounts(),
      );
    });

    it("throws instead of silently reporting 0 on a non-array response", async () => {
      client.invoke.mockImplementation((_action: string, params?: any) =>
        Promise.resolve(params.query === "is:suspended" ? {} : []),
      );

      await expect(fetchCardStateCounts(client)).rejects.toThrow(
        'Invalid findCards response for state "suspended": expected array',
      );
    });

    it("propagates AnkiConnect failures to the caller", async () => {
      client.invoke.mockRejectedValue(new Error("connection refused"));

      await expect(fetchCardStateCounts(client)).rejects.toThrow(
        "connection refused",
      );
    });
  });

  describe("emptyCardStateCounts", () => {
    it("returns a fresh zeroed object each call", () => {
      const first = emptyCardStateCounts();
      first.new = 99;

      expect(emptyCardStateCounts()).toEqual({
        new: 0,
        learning: 0,
        review: 0,
        suspended: 0,
        buried: 0,
      });
    });
  });
});
