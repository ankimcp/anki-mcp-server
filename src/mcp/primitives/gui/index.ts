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

// Tools - Browser
export { GuiBrowseTool } from "./tools/gui-browse.tool";
export { GuiSelectCardTool } from "./tools/gui-select-card.tool";
export { GuiSelectedNotesTool } from "./tools/gui-selected-notes.tool";

// Tools - Dialog
export { GuiAddCardsTool } from "./tools/gui-add-cards.tool";
export { GuiEditNoteTool } from "./tools/gui-edit-note.tool";
export { GuiDeckOverviewTool } from "./tools/gui-deck-overview.tool";
export { GuiDeckBrowserTool } from "./tools/gui-deck-browser.tool";

// Tools - Utility
export { GuiCurrentCardTool } from "./tools/gui-current-card.tool";
export { GuiShowQuestionTool } from "./tools/gui-show-question.tool";
export { GuiShowAnswerTool } from "./tools/gui-show-answer.tool";
export { GuiUndoTool } from "./tools/gui-undo.tool";

// Module
import { Module, DynamicModule, Provider } from "@nestjs/common";
import { AnkiConnectClient } from "../../clients/anki-connect.client";
import { GuiBrowseTool } from "./tools/gui-browse.tool";
import { GuiSelectCardTool } from "./tools/gui-select-card.tool";
import { GuiSelectedNotesTool } from "./tools/gui-selected-notes.tool";
import { GuiAddCardsTool } from "./tools/gui-add-cards.tool";
import { GuiEditNoteTool } from "./tools/gui-edit-note.tool";
import { GuiDeckOverviewTool } from "./tools/gui-deck-overview.tool";
import { GuiDeckBrowserTool } from "./tools/gui-deck-browser.tool";
import { GuiCurrentCardTool } from "./tools/gui-current-card.tool";
import { GuiShowQuestionTool } from "./tools/gui-show-question.tool";
import { GuiShowAnswerTool } from "./tools/gui-show-answer.tool";
import { GuiUndoTool } from "./tools/gui-undo.tool";

// MCP tools that need to be discovered by McpNest
// These are exported for use in AppModule.providers (required by MCP-Nest 1.9.0+)
export const GUI_MCP_TOOLS = [
  // Browser Tools
  GuiBrowseTool,
  GuiSelectCardTool,
  GuiSelectedNotesTool,
  // Dialog Tools
  GuiAddCardsTool,
  GuiEditNoteTool,
  GuiDeckOverviewTool,
  GuiDeckBrowserTool,
  // Utility Tools
  GuiCurrentCardTool,
  GuiShowQuestionTool,
  GuiShowAnswerTool,
  GuiUndoTool,
];

// All providers for the module (includes infrastructure like AnkiConnectClient)
const GUI_MCP_PRIMITIVES = [AnkiConnectClient, ...GUI_MCP_TOOLS];

export interface McpPrimitivesAnkiGuiModuleOptions {
  ankiConfigProvider: Provider;
  /** Required when ankiConfigProvider uses AppConfigService (provides APP_CONFIG dependency) */
  appConfigProvider?: Provider;
}

@Module({})
export class McpPrimitivesAnkiGuiModule {
  static forRoot(options: McpPrimitivesAnkiGuiModuleOptions): DynamicModule {
    const providers: Provider[] = [
      options.ankiConfigProvider,
      ...GUI_MCP_PRIMITIVES,
    ];

    // Add appConfigProvider if provided (needed for AppConfigService injection)
    if (options.appConfigProvider) {
      providers.push(options.appConfigProvider);
    }

    return {
      module: McpPrimitivesAnkiGuiModule,
      providers,
      exports: GUI_MCP_PRIMITIVES,
    };
  }
}
