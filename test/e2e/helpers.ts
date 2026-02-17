/**
 * E2E test helpers using MCP Inspector CLI
 *
 * Supports both HTTP Streamable and STDIO transport modes.
 */
import { execFileSync } from "child_process";
import { resolve } from "path";

// Transport mode configuration
export type TransportMode = "http" | "stdio";

interface TransportConfig {
  mode: TransportMode;
  // HTTP mode: server URL
  url?: string;
  // STDIO mode: command and args to spawn server
  command?: string;
  args?: string[];
}

// Check if testing against installed npm package
const TEST_NPM_PACKAGE = process.env.TEST_NPM_PACKAGE === "true";

// Default configurations
const HTTP_CONFIG: TransportConfig = {
  mode: "http",
  url: process.env.MCP_SERVER_URL || "http://localhost:3000",
};

const STDIO_CONFIG: TransportConfig = TEST_NPM_PACKAGE
  ? {
      mode: "stdio",
      command: "ankimcp",
      args: ["--stdio"],
    }
  : {
      mode: "stdio",
      command: "node",
      args: [resolve(__dirname, "../../dist/main-stdio.js")],
    };

// Read-only STDIO config
const STDIO_READ_ONLY_CONFIG: TransportConfig = TEST_NPM_PACKAGE
  ? {
      mode: "stdio",
      command: "ankimcp",
      args: ["--stdio", "--read-only"],
    }
  : {
      mode: "stdio",
      command: "node",
      args: [resolve(__dirname, "../../dist/main-stdio.js"), "--read-only"],
    };

// Current transport config (set by test setup)
let currentConfig: TransportConfig = HTTP_CONFIG;

const INSPECTOR_TIMEOUT = 30000; // 30s

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpResource {
  uri: string;
  name?: string;
  description?: string;
}

/**
 * Set transport mode for tests
 */
export function setTransport(
  mode: TransportMode,
  options?: { readOnly?: boolean },
): void {
  if (mode === "http") {
    currentConfig = HTTP_CONFIG;
  } else if (options?.readOnly) {
    currentConfig = STDIO_READ_ONLY_CONFIG;
  } else {
    currentConfig = STDIO_CONFIG;
  }
}

/**
 * Get current transport mode
 */
export function getTransport(): TransportMode {
  return currentConfig.mode;
}

/**
 * Run MCP Inspector CLI and return parsed JSON response
 */
export function runInspector(
  method: string,
  options: {
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    uri?: string;
  } = {},
): unknown {
  const args = ["@modelcontextprotocol/inspector", "--cli"];

  // Add transport-specific arguments
  if (currentConfig.mode === "http") {
    args.push(currentConfig.url!, "--transport", "http");
  } else {
    // STDIO mode: pass command to spawn
    args.push(
      currentConfig.command!,
      ...currentConfig.args!,
      "--transport",
      "stdio",
    );
  }

  args.push("--method", method);

  // Add tool-specific arguments
  if (options.toolName) {
    args.push("--tool-name", options.toolName);
  }

  if (options.toolArgs) {
    for (const [key, value] of Object.entries(options.toolArgs)) {
      const strValue =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      args.push("--tool-arg", `${key}=${strValue}`);
    }
  }

  if (options.uri) {
    args.push("--uri", options.uri);
  }

  try {
    const result = execFileSync("npx", args, {
      timeout: INSPECTOR_TIMEOUT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        // Pass AnkiConnect URL for both modes
        ANKI_CONNECT_URL:
          process.env.ANKI_CONNECT_URL || "http://localhost:8765",
      },
    });

    return JSON.parse(result);
  } catch (error) {
    if (error instanceof Error && "stderr" in error) {
      throw new Error(
        `Inspector failed: ${(error as { stderr: string }).stderr}`,
        { cause: error },
      );
    }
    throw error;
  }
}

/**
 * Call an MCP tool and return the result
 */
export function callTool(
  name: string,
  args?: Record<string, unknown>,
): Record<string, unknown> {
  const result = runInspector("tools/call", {
    toolName: name,
    toolArgs: args,
  }) as McpToolResult;

  if (result.structuredContent) {
    return result.structuredContent;
  }

  if (result.content && result.content.length > 0) {
    const textContent = result.content.find((c) => c.type === "text");
    if (textContent?.text) {
      try {
        return JSON.parse(textContent.text);
      } catch {
        return { text: textContent.text };
      }
    }
  }

  return result as Record<string, unknown>;
}

/**
 * List all available MCP tools
 */
export function listTools(): McpTool[] {
  const result = runInspector("tools/list") as { tools?: McpTool[] };
  return result.tools || [];
}

/**
 * Read an MCP resource by URI
 */
export function readResource(uri: string): Record<string, unknown> {
  const result = runInspector("resources/read", { uri }) as {
    contents?: Array<{ text?: string }>;
  };

  if (result.contents && result.contents.length > 0) {
    const content = result.contents[0];
    if (content.text) {
      try {
        return JSON.parse(content.text);
      } catch {
        return { text: content.text };
      }
    }
  }

  return result as Record<string, unknown>;
}

/**
 * List all available MCP resources
 */
export function listResources(): McpResource[] {
  const result = runInspector("resources/list") as {
    resources?: McpResource[];
  };
  return result.resources || [];
}

/**
 * Wait for MCP server to be ready (HTTP mode only)
 */
export async function waitForServer(maxWaitSeconds = 60): Promise<boolean> {
  if (currentConfig.mode === "stdio") {
    // STDIO mode doesn't need to wait - inspector spawns the server
    return true;
  }

  const startTime = Date.now();
  const maxWaitMs = maxWaitSeconds * 1000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const tools = listTools();
      if (tools.length > 0) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}
