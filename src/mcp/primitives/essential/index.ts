// Configuration
export { ANKI_CONFIG } from "../../config/anki-config.interface";
export type { IAnkiConfig } from "../../config/anki-config.interface";

// Types
export * from "../../types/anki.types";

// Utilities
export * from "../../utils/anki.utils";

// Clients
export {
  AnkiConnectClient,
  AnkiConnectError,
  ReadOnlyModeError,
} from "../../clients/anki-connect.client";

// Tools
export { SyncTool } from "./tools/sync.tool";
export { GetDueCardsTool } from "./tools/get-due-cards.tool";
export { GetCardsTool } from "./tools/get-cards.tool";
export { PresentCardTool } from "./tools/present-card.tool";
export { RateCardTool } from "./tools/rate-card.tool";
export { ModelNamesTool } from "./tools/model-names.tool";
export { ModelFieldNamesTool } from "./tools/model-field-names.tool";
export { ModelStylingTool } from "./tools/model-styling.tool";
export { CreateModelTool } from "./tools/create-model.tool";
export { UpdateModelStylingTool } from "./tools/update-model-styling.tool";
export { AddNoteTool } from "./tools/add-note.tool";
export { AddNotesTool } from "./tools/add-notes.tool";
export { FindNotesTool } from "./tools/find-notes.tool";
export { NotesInfoTool } from "./tools/notes-info.tool";
export { UpdateNoteFieldsTool } from "./tools/update-note-fields.tool";
export { DeleteNotesTool } from "./tools/delete-notes.tool";
export { GetTagsTool } from "./tools/get-tags.tool";
// Deck tools (split from former deckActions aggregate)
export { ListDecksTool } from "./tools/list-decks.tool";
export { DeckStatsTool } from "./tools/deck-stats.tool";
export { CreateDeckTool } from "./tools/create-deck.tool";
export { ChangeDeckTool } from "./tools/change-deck.tool";
// Media tools (split from former mediaActions aggregate)
export { RetrieveMediaFileTool } from "./tools/retrieve-media-file.tool";
export { GetMediaFilesNamesTool } from "./tools/get-media-files-names.tool";
export { StoreMediaFileTool } from "./tools/store-media-file.tool";
export { DeleteMediaFileTool } from "./tools/delete-media-file.tool";
// Tag tools (split from former tagActions aggregate)
export { AddTagsTool } from "./tools/add-tags.tool";
export { RemoveTagsTool } from "./tools/remove-tags.tool";
export { ReplaceTagsTool } from "./tools/replace-tags.tool";
export { ClearUnusedTagsTool } from "./tools/clear-unused-tags.tool";
export { CollectionStatsTool } from "./tools/collection-stats";
export { ReviewStatsTool } from "./tools/review-stats";

// Prompts
export { ReviewSessionPrompt } from "./prompts/review-session.prompt";
export { TwentyRulesPrompt } from "./prompts/twenty-rules.prompt";

// Resources
export { SystemInfoResource } from "./resources/system-info.resource";

// Module
import { Module, DynamicModule, Provider } from "@nestjs/common";
import { AnkiConnectClient } from "../../clients/anki-connect.client";
import { SyncTool } from "./tools/sync.tool";
import { GetDueCardsTool } from "./tools/get-due-cards.tool";
import { GetCardsTool } from "./tools/get-cards.tool";
import { PresentCardTool } from "./tools/present-card.tool";
import { RateCardTool } from "./tools/rate-card.tool";
import { ModelNamesTool } from "./tools/model-names.tool";
import { ModelFieldNamesTool } from "./tools/model-field-names.tool";
import { ModelStylingTool } from "./tools/model-styling.tool";
import { CreateModelTool } from "./tools/create-model.tool";
import { UpdateModelStylingTool } from "./tools/update-model-styling.tool";
import { AddNoteTool } from "./tools/add-note.tool";
import { AddNotesTool } from "./tools/add-notes.tool";
import { FindNotesTool } from "./tools/find-notes.tool";
import { NotesInfoTool } from "./tools/notes-info.tool";
import { UpdateNoteFieldsTool } from "./tools/update-note-fields.tool";
import { DeleteNotesTool } from "./tools/delete-notes.tool";
import { GetTagsTool } from "./tools/get-tags.tool";
import { ListDecksTool } from "./tools/list-decks.tool";
import { DeckStatsTool } from "./tools/deck-stats.tool";
import { CreateDeckTool } from "./tools/create-deck.tool";
import { ChangeDeckTool } from "./tools/change-deck.tool";
import { RetrieveMediaFileTool } from "./tools/retrieve-media-file.tool";
import { GetMediaFilesNamesTool } from "./tools/get-media-files-names.tool";
import { StoreMediaFileTool } from "./tools/store-media-file.tool";
import { DeleteMediaFileTool } from "./tools/delete-media-file.tool";
import { AddTagsTool } from "./tools/add-tags.tool";
import { RemoveTagsTool } from "./tools/remove-tags.tool";
import { ReplaceTagsTool } from "./tools/replace-tags.tool";
import { ClearUnusedTagsTool } from "./tools/clear-unused-tags.tool";
import { CollectionStatsTool } from "./tools/collection-stats";
import { ReviewStatsTool } from "./tools/review-stats";
import { ReviewSessionPrompt } from "./prompts/review-session.prompt";
import { TwentyRulesPrompt } from "./prompts/twenty-rules.prompt";
import { SystemInfoResource } from "./resources/system-info.resource";

// MCP primitives that need to be discovered by McpNest (tools, prompts, resources)
// These are exported for use in AppModule.providers (required by MCP-Nest 1.9.0+)
export const ESSENTIAL_MCP_TOOLS = [
  SyncTool,
  GetDueCardsTool,
  GetCardsTool,
  PresentCardTool,
  RateCardTool,
  ModelNamesTool,
  ModelFieldNamesTool,
  ModelStylingTool,
  CreateModelTool,
  UpdateModelStylingTool,
  AddNoteTool,
  AddNotesTool,
  FindNotesTool,
  NotesInfoTool,
  UpdateNoteFieldsTool,
  DeleteNotesTool,
  GetTagsTool,
  // Deck tools
  ListDecksTool,
  DeckStatsTool,
  CreateDeckTool,
  ChangeDeckTool,
  // Media tools
  RetrieveMediaFileTool,
  GetMediaFilesNamesTool,
  StoreMediaFileTool,
  DeleteMediaFileTool,
  // Tag tools
  AddTagsTool,
  RemoveTagsTool,
  ReplaceTagsTool,
  ClearUnusedTagsTool,
  CollectionStatsTool,
  ReviewStatsTool,
  // Prompts
  ReviewSessionPrompt,
  TwentyRulesPrompt,
  // Resources
  SystemInfoResource,
];

// All providers for the module (includes infrastructure like AnkiConnectClient)
const ESSENTIAL_MCP_PRIMITIVES = [AnkiConnectClient, ...ESSENTIAL_MCP_TOOLS];

export interface McpPrimitivesAnkiEssentialModuleOptions {
  ankiConfigProvider: Provider;
}

@Module({})
export class McpPrimitivesAnkiEssentialModule {
  static forRoot(
    options: McpPrimitivesAnkiEssentialModuleOptions,
  ): DynamicModule {
    return {
      module: McpPrimitivesAnkiEssentialModule,
      providers: [options.ankiConfigProvider, ...ESSENTIAL_MCP_PRIMITIVES],
      exports: ESSENTIAL_MCP_PRIMITIVES,
    };
  }
}
