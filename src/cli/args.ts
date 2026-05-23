import { Command } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import updateNotifier from "update-notifier";
import type { Cli } from "./cli-output";
import { getVersion } from "../version";

export interface CliOptions {
  port: number;
  host: string;
  ankiConnect: string;
  ngrok: boolean;
  readOnly: boolean;
  login: string | boolean;
  logout: boolean;
  tunnel: string | boolean;
  debug: boolean;
}

function getPackageJson() {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "../../package.json"), "utf-8"),
    );
  } catch {
    return { version: "0.0.0", name: "ankimcp" };
  }
}

export function checkForUpdates(): void {
  updateNotifier({ pkg: getPackageJson() }).notify();
}

/**
 * Validate an optional URL coming from Commander's `[url]` syntax.
 *
 * Commander represents `[url]` as:
 *  - `true`  → the flag was passed with no value (e.g. `--tunnel`)
 *  - `false` → the flag was not passed at all
 *  - `string` → the flag was passed with an explicit value
 *
 * Crucially, an empty-string value (e.g. `--tunnel ""` from a shell expansion
 * of an unset env var) is a user-supplied override intent — silently falling
 * back to a default is a footgun. We treat any explicit string as a URL the
 * user wants honoured, validate it, and reject if it doesn't parse.
 *
 * @param raw - The raw value Commander parsed for the option.
 * @param flag - Flag name (e.g. `--tunnel`), used only in error output.
 * @param cli - User-facing output surface for error reporting.
 * @returns The validated URL string, or `undefined` if the user did not pass
 *   the flag at all. Callers should use `??` (not `||`) when applying their
 *   own fallback so that legitimate non-empty strings are never overridden.
 */
export function parseOptionalUrl(
  raw: string | boolean,
  flag: string,
  cli: Cli,
): string | undefined {
  // Flag not passed, or passed without a value — defer to caller's fallback.
  if (raw === false || raw === true) {
    return undefined;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    cli.error(
      `Invalid ${flag} URL: ${raw === "" ? "(empty string)" : raw}. Expected a ws:// or wss:// URL.`,
    );
    process.exit(1);
  }

  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    cli.error(
      `Invalid ${flag} URL protocol: ${parsed.protocol}. Expected ws:// or wss://.`,
    );
    process.exit(1);
  }

  return raw;
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
    .option(
      "--login [url]",
      "Authenticate with tunnel service (also triggered automatically by --tunnel when needed)",
    )
    .option("--logout", "Clear tunnel credentials")
    .option(
      "--tunnel [url]",
      "Connect to tunnel server (auto-launches browser login if not authenticated; default URL: wss://tunnel.ankimcp.ai)",
    )
    .option("-d, --debug", "Enable debug logging (shows stack traces)")
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

Tunnel Mode:
  $ ankimcp --tunnel                          # Connect to wss://tunnel.ankimcp.ai
                                              # (auto-launches browser login if needed)
  $ ankimcp --tunnel wss://tunnel.ankimcp.ai/tunnel  # Production tunnel (explicit)
  $ ankimcp --login                           # Pre-authenticate (optional)
  $ ankimcp --login wss://custom.server.com/tunnel   # Login to custom server
  $ ankimcp --logout                          # Clear saved credentials
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
    login: options.login ?? false,
    logout: options.logout || false,
    tunnel: options.tunnel ?? false,
    debug: options.debug || false,
  };
}

export function displayStartupBanner(
  cli: Cli,
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

  cli.info(`
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
