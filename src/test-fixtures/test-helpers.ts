/**
 * Helper functions for testing MCP tools
 */

/**
 * Parse the result from MCP tool response format
 * MCP tools return responses wrapped in a specific format with content array
 */
export function parseToolResult(result: any): any {
  if (result?.content?.[0]?.text) {
    return JSON.parse(result.content[0].text);
  }
  return result;
}

/**
 * Create a mock context for MCP tools
 */
export function createMockContext() {
  return {
    reportProgress: jest.fn().mockResolvedValue(undefined),
    log: {
      debug: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    },
    mcpServer: {} as any,
    mcpRequest: {} as any,
  };
}

/**
 * The `findCards` queries `fetchCardStateCounts` issues, in emission order.
 * Mirrors `CARD_STATE_QUERIES` in `@/mcp/utils/card-states.utils`; the
 * authoritative assertions on those literals live in
 * `src/mcp/utils/__tests__/card-states.utils.spec.ts`, so this copy only has to
 * be good enough to route mock responses.
 */
export const CARD_STATE_QUERY_FILTERS = [
  "is:new -is:suspended -is:buried",
  "is:learn -is:suspended -is:buried",
  "is:review -is:learn -is:suspended -is:buried",
  "is:suspended",
  "is:buried",
] as const;

/** Card IDs to hand back per card state, used to build `findCards` mocks. */
export interface StateCardIds {
  new?: number[];
  learning?: number[];
  review?: number[];
  suspended?: number[];
  buried?: number[];
}

/**
 * Resolve a `findCards` query to a card-ID array for stats-tool tests.
 *
 * State queries (optionally prefixed with a `deck:` scope) return their slice;
 * anything else — the plain `"deck:X"` / `deck:*` listing query — returns
 * `allCardIds`.
 */
export function findCardsFor(
  query: string,
  allCardIds: number[],
  states: StateCardIds = {},
): number[] {
  const byState = [
    states.new,
    states.learning,
    states.review,
    states.suspended,
    states.buried,
  ];
  const index = CARD_STATE_QUERY_FILTERS.findIndex(
    (filter) => query === filter || query.endsWith(` ${filter}`),
  );
  if (index === -1) return allCardIds;
  return byState[index] ?? [];
}
