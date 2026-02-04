import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import updateNotifier from "update-notifier";

export interface CliOptions {
  port: number;
  host: string;
  ankiConnect: string;
  ngrok: boolean;
  readOnly: boolean;
}

function getPackageJson() {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "../package.json"), "utf-8"),
    );
  } catch {
    return { version: "0.0.0", name: "ankimcp" };
  }
}

function getVersion(): string {
  return getPackageJson().version;
}

export function checkForUpdates(): void {
  updateNotifier({ pkg: getPackageJson() }).notify();
}

export function parseCliArgs(): CliOptions {
  const program = new Command();

  program
    .name("ankimcp")
    .description("AnkiMCP Server - Model Context Protocol server for Anki")
    .version(getVersion())
    .option(
      "--stdio",
      "Run in STDIO mode (for MCP clients like Cursor, Cline, Zed)",
    )
    .option("-p, --port <number>", "Port to listen on (HTTP mode)", "3000")
    .option("-h, --host <address>", "Host to bind to (HTTP mode)", "127.0.0.1")
    .option(
      "-a, --anki-connect <url>",
      "AnkiConnect URL",
      "http://localhost:8765",
    )
    .option(
      "--ngrok",
      "Start ngrok tunnel (requires global ngrok installation)",
    )
    .option(
      "--read-only",
      "Run in read-only mode (blocks all write operations)",
    )
    .addHelpText(
      "after",
      `
Transport Modes:
  HTTP Mode (default):  For web-based AI assistants (ChatGPT, Claude.ai)
  STDIO Mode:           For desktop MCP clients (Cursor, Cline, Zed)

Examples - HTTP Mode:
  $ ankimcp                                    # Use defaults
  $ ankimcp --port 8080                        # Custom port
  $ ankimcp --host 0.0.0.0 --port 3000         # Listen on all interfaces
  $ ankimcp --anki-connect http://localhost:8765

Examples - HTTP Mode with Ngrok:
  $ ankimcp --ngrok                            # Start with ngrok tunnel
  $ ankimcp --port 8080 --ngrok                # Custom port + ngrok
  $ ankimcp --host 0.0.0.0 --ngrok             # Public host + ngrok

Examples - STDIO Mode:
  $ ankimcp --stdio                            # For use with npx in MCP clients

  # MCP client configuration (Cursor, Cline, Zed, etc.):
  {
    "mcpServers": {
      "anki-mcp": {
        "command": "npx",
        "args": ["-y", "ankimcp", "--stdio"]
      }
    }
  }

Examples - Read-Only Mode:
  $ ankimcp --read-only                        # HTTP mode, read-only
  $ ankimcp --stdio --read-only                # STDIO mode, read-only

Ngrok Setup (one-time):
  1. Install: npm install -g ngrok
  2. Get auth token from: https://dashboard.ngrok.com/get-started/your-authtoken
  3. Setup: ngrok config add-authtoken <your-token>
  4. Run: ankimcp --ngrok
`,
    );

  program.parse();

  const options = program.opts<CliOptions>();

  return {
    port: parseInt(options.port.toString(), 10),
    host: options.host,
    ankiConnect: options.ankiConnect,
    ngrok: options.ngrok || false,
    readOnly: options.readOnly || false,
  };
}

export function displayStartupBanner(
  options: CliOptions,
  ngrokUrl?: string,
): void {
  const version = getVersion();
  const title = `AnkiMCP HTTP Server v${version}`;
  const padding = Math.floor((64 - title.length) / 2);
  const paddedTitle =
    " ".repeat(padding) + title + " ".repeat(64 - padding - title.length);

  const readOnlyWarning = options.readOnly
    ? "\n\n** READ-ONLY MODE ENABLED **\nContent modifications (addNote, deleteNotes, createDeck, etc.) are blocked.\nReview operations (sync, answerCards, suspend) remain available."
    : "";

  console.log(`
╔════════════════════════════════════════════════════════════════╗
║${paddedTitle}║
╚════════════════════════════════════════════════════════════════╝${readOnlyWarning}

🚀 Server running on: http://${options.host}:${options.port}
🔌 AnkiConnect URL:   ${options.ankiConnect}${ngrokUrl ? `\n🌐 Ngrok tunnel:      ${ngrokUrl}` : ""}${options.readOnly ? "\n🔒 Mode:              Read-only" : ""}

Configuration:
  • Port:               ${options.port} (override: --port 8080)
  • Host:               ${options.host} (override: --host 0.0.0.0)
  • AnkiConnect:        ${options.ankiConnect}
                        (override: --anki-connect http://localhost:8765)${options.readOnly ? "\n  • Read-only:          Yes (write operations blocked)" : ""}${ngrokUrl ? `\n  • Ngrok tunnel:       ${ngrokUrl}\n  • Ngrok dashboard:    http://localhost:4040` : ""}
${
  !ngrokUrl
    ? `
Usage with ngrok:
  1. Install: npm install -g ngrok
  2. Setup: ngrok config add-authtoken <your-token>
  3. Run: ankimcp --ngrok
`
    : `
Share this URL with your AI assistant:
  ${ngrokUrl}
`
}
Run 'ankimcp --help' for more options.
`);
}
