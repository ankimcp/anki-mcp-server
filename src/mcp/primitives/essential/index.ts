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
export { FindNotesTool } from "./tools/find-notes.tool";
export { NotesInfoTool } from "./tools/notes-info.tool";
export { UpdateNoteFieldsTool } from "./tools/update-note-fields.tool";
export { DeleteNotesTool } from "./tools/delete-notes.tool";
export { MediaActionsTool } from "./tools/mediaActions";
export { GetTagsTool } from "./tools/get-tags.tool";
export { TagActionsTool } from "./tools/tagActions";
export { DeckActionsTool } from "./tools/deckActions";
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
import { FindNotesTool } from "./tools/find-notes.tool";
import { NotesInfoTool } from "./tools/notes-info.tool";
import { UpdateNoteFieldsTool } from "./tools/update-note-fields.tool";
import { DeleteNotesTool } from "./tools/delete-notes.tool";
import { MediaActionsTool } from "./tools/mediaActions";
import { GetTagsTool } from "./tools/get-tags.tool";
import { TagActionsTool } from "./tools/tagActions";
import { DeckActionsTool } from "./tools/deckActions";
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
  FindNotesTool,
  NotesInfoTool,
  UpdateNoteFieldsTool,
  DeleteNotesTool,
  MediaActionsTool,
  GetTagsTool,
  TagActionsTool,
  DeckActionsTool,
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
