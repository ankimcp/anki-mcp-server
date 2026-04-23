/**
 * Utilities for working with Anki's `Parent::Child` deck hierarchy.
 *
 * Anki's scheduler reports counts for a parent deck as the rollup over all
 * descendants (this is what the Anki UI shows in the deck browser and what
 * AnkiConnect's `getDeckStats` returns in `new_count` / `learn_count` /
 * `review_count`). However `total_in_deck` from the same response is the
 * count of cards stored *directly* in that deck's table — it does NOT
 * include descendants. To keep per-deck arithmetic consistent
 * (`total >= new + learning + review`) we need to roll up `total_in_deck`
 * the same way.
 */

/**
 * Direct children of a deck are deck names that equal `${deckName}::<something>`
 * with exactly one additional segment. We only need DESCENDANT detection here
 * (children + grandchildren + ...) because we sum leaf `total_in_deck` values.
 */
export function isDescendantOf(deckName: string, ancestor: string): boolean {
  return deckName.startsWith(`${ancestor}::`);
}

/**
 * Return the set of root deck names (names without `::`). In Anki's deck
 * browser these are the top-level rows; their rolled-up totals already
 * include every descendant, so summing just the roots gives the true
 * collection total without double-counting children.
 */
export function getRootDeckNames(allDeckNames: readonly string[]): string[] {
  return allDeckNames.filter((name) => !name.includes("::"));
}

/**
 * Compute the rolled-up `total` for a deck by summing its own `total_in_deck`
 * plus the `total_in_deck` of every descendant. Descendants are identified
 * purely by name prefix (`deckName::`), matching how Anki stores the
 * hierarchy.
 *
 * @param deckName - The deck to roll up totals for
 * @param perDeckOwnTotal - Map of deck name → `total_in_deck` (own cards only)
 */
export function rollupDeckTotal(
  deckName: string,
  perDeckOwnTotal: ReadonlyMap<string, number>,
): number {
  let sum = perDeckOwnTotal.get(deckName) ?? 0;
  for (const [name, total] of perDeckOwnTotal) {
    if (isDescendantOf(name, deckName)) {
      sum += total;
    }
  }
  return sum;
}
