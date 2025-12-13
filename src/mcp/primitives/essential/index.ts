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
} from "../../clients/anki-connect.client";

// Tools
export { SyncTool } from "./tools/sync.tool";
export { ListDecksTool } from "./tools/list-decks.tool";
export { CreateDeckTool } from "./tools/create-deck.tool";
export { GetDueCardsTool } from "./tools/get-due-cards.tool";
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

// Prompts
export { ReviewSessionPrompt } from "./prompts/review-session.prompt";
export { TwentyRulesPrompt } from "./prompts/twenty-rules.prompt";

// Resources
export { SystemInfoResource } from "./resources/system-info.resource";

// Module
import { Module, DynamicModule, Provider } from "@nestjs/common";
import { AnkiConnectClient } from "../../clients/anki-connect.client";
import { SyncTool } from "./tools/sync.tool";
import { ListDecksTool } from "./tools/list-decks.tool";
import { CreateDeckTool } from "./tools/create-deck.tool";
import { GetDueCardsTool } from "./tools/get-due-cards.tool";
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
import { ReviewSessionPrompt } from "./prompts/review-session.prompt";
import { TwentyRulesPrompt } from "./prompts/twenty-rules.prompt";
import { SystemInfoResource } from "./resources/system-info.resource";

const MCP_PRIMITIVES = [
  // Client
  AnkiConnectClient,
  // Tools
  SyncTool,
  ListDecksTool,
  CreateDeckTool,
  GetDueCardsTool,
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
  // Prompts
  ReviewSessionPrompt,
  TwentyRulesPrompt,
  // Resources
  SystemInfoResource,
];

export interface McpPrimitivesAnkiEssentialModuleOptions {
  ankiConfigProvider: Provider;
  /** Required when ankiConfigProvider uses AppConfigService (provides APP_CONFIG dependency) */
  appConfigProvider?: Provider;
}

@Module({})
export class McpPrimitivesAnkiEssentialModule {
  static forRoot(
    options: McpPrimitivesAnkiEssentialModuleOptions,
  ): DynamicModule {
    const providers: Provider[] = [
      options.ankiConfigProvider,
      ...MCP_PRIMITIVES,
    ];

    // Add appConfigProvider if provided (needed for AppConfigService injection)
    if (options.appConfigProvider) {
      providers.push(options.appConfigProvider);
    }

    return {
      module: McpPrimitivesAnkiEssentialModule,
      providers,
      exports: MCP_PRIMITIVES,
    };
  }
}
