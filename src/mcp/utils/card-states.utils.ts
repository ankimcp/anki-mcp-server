import { z } from "zod";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";

/**
 * Card counting for the stats tools.
 *
 * This module deliberately owns BOTH halves of the deck-count story:
 *
 * - the scheduler's **due tree** counts (`dueTreeCountsSchema`) that AnkiConnect
 *   returns from `getDeckStats`, and
 * - the true **card-state** counts (`cardStatesSchema`, `fetchCardStateCounts`)
 *   computed from Anki searches.
 *
 * They are constantly mistaken for one another, so their wording lives side by
 * side here and is reused verbatim by every tool surface — that is what stops
 * the two descriptions drifting apart again.
 */

// ---------------------------------------------------------------------------
// Card states (search-derived)
// ---------------------------------------------------------------------------

/**
 * True card-state counts, derived from Anki searches rather than from the
 * scheduler's due tree.
 *
 * Unlike AnkiConnect's `getDeckStats` buckets, these numbers are NOT filtered
 * by due date and NOT capped by daily new/review limits — they answer "how many
 * cards are in this state" rather than "how many will I study today".
 *
 * Single source of truth: the TypeScript type is derived from this schema, so
 * the two can't fall out of sync.
 */
export const cardStateCountsSchema = z.object({
  new: z
    .number()
    .describe(
      "Cards never studied, excluding suspended and buried. True count: " +
        "not filtered by due date and not capped by the daily new-card limit.",
    ),
  learning: z
    .number()
    .describe(
      "Cards in learning or relearning (lapsed cards are counted here), " +
        "excluding suspended and buried.",
    ),
  review: z
    .number()
    .describe(
      "Cards in the review state that are not relearning, excluding " +
        "suspended and buried. Young and mature, due or not due.",
    ),
  suspended: z
    .number()
    .describe("Suspended cards, whatever their underlying state."),
  buried: z
    .number()
    .describe(
      "Buried cards (manually or automatically), whatever their underlying state.",
    ),
});

/** True card-state counts. Derived from {@link cardStateCountsSchema}. */
export type CardStateCounts = z.infer<typeof cardStateCountsSchema>;

/**
 * Zod schema for the `states` block, shared by `deckStats` and
 * `collection_stats` so both surfaces describe the fields identically.
 *
 * @param scope Human-readable scope inserted into the block description, e.g.
 *   `"this deck and all of its subdecks"` or `"the whole collection"`.
 */
export function cardStatesSchema(scope: string) {
  return cardStateCountsSchema.describe(
    `True card-state counts for ${scope}, computed from Anki searches ` +
      "(is:new / is:learn / is:review / is:suspended / is:buried). " +
      "Unaffected by due dates and daily limits — use these to answer " +
      '"how many cards are in state X", and `counts` to answer ' +
      '"what will I study today". The five values are mutually exclusive ' +
      "and together cover every card in scope.",
  );
}

/**
 * Search fragment per card state. `satisfies Record<keyof CardStateCounts, …>`
 * makes the compiler reject a missing or misspelled state, and the declaration
 * order below is the order the queries are issued in (JS preserves insertion
 * order for string keys), so call sequences stay deterministic.
 *
 * Semantics verified against Anki's search implementation
 * (`rslib/src/search/sqlwriter.rs`, `write_state`) and the manual's
 * "Card state" section (https://docs.ankiweb.net/searching.html):
 *
 * - `is:new`       → `c.type = New`
 * - `is:learn`     → `c.type in (Learn, Relearn)`
 * - `is:review`    → `c.type in (Review, Relearn)`
 * - `is:suspended` → `c.queue = Suspended`
 * - `is:buried`    → `c.queue in (SchedBuried, UserBuried)`
 *
 * Because `is:learn` and `is:review` overlap on relearning (lapsed) cards, the
 * review filter subtracts `is:learn` — the manual documents `-is:learn is:review`
 * as "review cards, not including lapsed cards". Lapsed cards are therefore
 * reported under `learning`, matching how Anki's deck browser groups them.
 *
 * `is:new`/`is:learn`/`is:review` are card-TYPE predicates, so they still match
 * suspended and buried cards; the three active buckets subtract them explicitly.
 * Since `suspended` and `buried` are disjoint queue states, the five filters
 * cover every card exactly once:
 * `new + learning + review + suspended + buried === cards matched by the scope`.
 */
const CARD_STATE_QUERIES = {
  new: "is:new -is:suspended -is:buried",
  learning: "is:learn -is:suspended -is:buried",
  review: "is:review -is:learn -is:suspended -is:buried",
  suspended: "is:suspended",
  buried: "is:buried",
} satisfies Record<keyof CardStateCounts, string>;

/** All-zero state counts, for empty decks / empty collections. */
export function emptyCardStateCounts(): CardStateCounts {
  return { new: 0, learning: 0, review: 0, suspended: 0, buried: 0 };
}

/**
 * Characters that keep a special meaning **inside** double quotes in an Anki
 * search and therefore need a backslash: `\` (the escape character itself),
 * `"`, and the `*` / `_` wildcards. Quoting the term already handles spaces,
 * parentheses, leading hyphens and the `and`/`or` keywords.
 *
 * Colons are deliberately NOT escaped: in a `deck:` term everything after the
 * first colon is the value, so `Parent::Child` must pass through untouched.
 *
 * @see https://docs.ankiweb.net/searching.html#matching-special-characters
 */
const ANKI_SEARCH_SPECIALS = /[\\"*_]/g;

/**
 * Build the `deck:` scope term for a deck-scoped query.
 *
 * Anki's `deck:` term matches the deck AND all of its descendants by default,
 * and also matches cards temporarily pulled into a filtered deck from that
 * subtree (`c.odid`), so a single term covers the whole subtree.
 *
 * The name is escaped so it is matched literally: without this, a deck called
 * `JLPT_N5` would also match `JLPT-N5`, `A*B` would match far too much, and a
 * name containing a backslash would produce an invalid escape sequence that
 * AnkiConnect rejects outright. Callers resolve the name against
 * `deckNamesAndIds` first, so it is always a literal deck name, never a pattern.
 */
export function deckScopeQuery(deckName: string): string {
  return `"deck:${deckName.replace(ANKI_SEARCH_SPECIALS, (char) => `\\${char}`)}"`;
}

/**
 * Count cards by true state via `findCards`.
 *
 * Issues one `findCards` call per state (5 total), sequentially — the
 * AnkiConnect client serializes requests through a mutex anyway, so parallelism
 * would buy nothing while consuming queue depth.
 *
 * @param client AnkiConnect client
 * @param scope Optional search prefix limiting the counts, e.g. the result of
 *   {@link deckScopeQuery}. Omit to count across the whole collection.
 * @throws if AnkiConnect returns a non-array for any of the queries — better a
 *   surfaced error than a silently plausible zero.
 *
 * @see https://docs.ankiweb.net/searching.html#card-state
 * @see https://git.sr.ht/~foosoft/anki-connect#findcards
 */
export async function fetchCardStateCounts(
  client: AnkiConnectClient,
  scope?: string,
): Promise<CardStateCounts> {
  const prefix = scope ? `${scope} ` : "";
  const counts = emptyCardStateCounts();

  const entries = Object.entries(CARD_STATE_QUERIES) as [
    keyof CardStateCounts,
    string,
  ][];

  for (const [state, filter] of entries) {
    const cardIds = await client.invoke<number[]>("findCards", {
      query: `${prefix}${filter}`,
    });

    if (!Array.isArray(cardIds)) {
      throw new Error(
        `Invalid findCards response for state "${state}": expected array`,
      );
    }

    counts[state] = cardIds.length;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Due-tree counts (getDeckStats-derived)
// ---------------------------------------------------------------------------

/**
 * The `total === new + learning + review + other` relationship, stated
 * honestly. `other` is computed as a clamped difference, so the identity can
 * break in the rare cases where the scheduler's buckets exceed the storage-deck
 * row count.
 */
export const DUE_TREE_INVARIANT_NOTE =
  "Normally total === new + learning + review + other; `other` is clamped at 0, " +
  "so in rare filtered-deck / inherited-limit cases the sum can exceed total.";

/**
 * Field schemas for a scheduler due-tree count block, shared by `deckStats`,
 * `collection_stats.counts` and `collection_stats.per_deck` so all three
 * describe the same numbers the same way.
 *
 * @param totalDescription Scope-specific description for `total` — the only
 *   field whose meaning changes between surfaces.
 */
export function dueTreeCountsShape(totalDescription: string) {
  return {
    total: z.number().describe(totalDescription),
    new: z
      .number()
      .describe(
        "New cards queued for study TODAY, capped by each deck's daily " +
          "new-card limit. This is not the total number of new cards — " +
          "see states.new.",
      ),
    learning: z
      .number()
      .describe(
        "Learning/relearning cards due now or today, the interday part " +
          "capped by the daily review limit.",
      ),
    review: z
      .number()
      .describe(
        "Review cards DUE TODAY, capped by each deck's daily review limit. " +
          "Not 'mature' cards and not all review cards — cards scheduled " +
          "for a future day are excluded. See states.review.",
      ),
    other: z
      .number()
      .describe(
        "Arithmetic remainder: total - new - learning - review. NOT a card " +
          "state. Dominated by review cards not due today plus new cards " +
          "beyond the daily new limit; suspended and buried cards also land " +
          "here. It can also reflect the mismatch between total (counted by " +
          "storage deck) and the scheduler buckets when a filtered deck has " +
          "borrowed cards from this deck. Use `states` for real per-state counts.",
      ),
  };
}

/**
 * Scheduler due-tree counts: the `getDeckStats` buckets plus the residual
 * `other`. Derived from {@link dueTreeCountsShape} so the tools' result
 * interfaces can't drift from the schemas they are validated against.
 *
 * Semantics — these are TODAY'S STUDY QUEUE, not card totals: due-today only,
 * capped by daily new/review limits, suspended/buried excluded, rolled up over
 * subdecks. `other` is a clamped remainder. See {@link DUE_TREE_INVARIANT_NOTE}
 * and the per-field `.describe()` text in {@link dueTreeCountsShape}.
 */
export type DueTreeCounts = {
  [K in keyof ReturnType<typeof dueTreeCountsShape>]: z.infer<
    ReturnType<typeof dueTreeCountsShape>[K]
  >;
};

/**
 * Zod schema for a scheduler due-tree count block.
 *
 * @param options.scope Human-readable scope, e.g. `"this deck and its descendants"`.
 * @param options.total Description for the `total` field.
 * @param options.note Optional extra sentence appended to the block description.
 */
export function dueTreeCountsSchema(options: {
  scope: string;
  total: string;
  note?: string;
}) {
  return z
    .object(dueTreeCountsShape(options.total))
    .describe(
      `Today's study queue for ${options.scope}, exactly as shown in Anki's ` +
        "deck browser: due-today counts capped by the daily new/review limits " +
        "(parent limits included), always excluding suspended and buried cards. " +
        "These are NOT card totals — use `states`. " +
        (options.note ? `${options.note} ` : "") +
        DUE_TREE_INVARIANT_NOTE,
    );
}
