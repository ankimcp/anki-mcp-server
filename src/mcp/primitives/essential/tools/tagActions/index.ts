/**
 * Tag actions module exports
 */

export { TagActionsTool } from "./tagActions.tool";

// Export action types for testing
export type { AddTagsParams, AddTagsResult } from "./actions/addTags.action";
export type {
  RemoveTagsParams,
  RemoveTagsResult,
} from "./actions/removeTags.action";
export type {
  ReplaceTagsParams,
  ReplaceTagsResult,
} from "./actions/replaceTags.action";
export type {
  ClearUnusedTagsParams,
  ClearUnusedTagsResult,
} from "./actions/clearUnusedTags.action";
