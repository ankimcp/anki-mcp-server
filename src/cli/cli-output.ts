/**
 * CLI Output Utility
 *
 * Use this for user-facing CLI output (clean, no timestamps).
 * For logging (errors, debug, warnings), use Pino logger instead.
 *
 * Debug behaviour is an *explicit dependency*: callers construct a `Cli`
 * instance via {@link createCli} at bootstrap, then pass it down to anything
 * that needs to print user-facing output. There is no module-level mutable
 * state — this keeps the surface trivially testable and prevents debug-mode
 * leakage across tests in the same Jest worker.
 */

import { getVersion } from "@/version";

// ANSI color codes
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};

/**
 * Print success message with green checkmark
 */
export function success(message: string): void {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

/**
 * Print warning message with yellow exclamation
 */
export function warn(message: string): void {
  console.warn(`${colors.yellow}!${colors.reset} ${message}`);
}

/**
 * Print info message (no icon)
 */
export function info(message: string): void {
  console.log(message);
}

/**
 * Print a blank line for spacing
 */
export function blank(): void {
  console.log();
}

/**
 * Print a boxed message (for important announcements like tunnel URLs)
 */
export function box(title: string, content: string): void {
  const width = Math.max(title.length, content.length) + 4;
  const border = "─".repeat(width);

  console.log(`┌${border}┐`);
  console.log(`│ ${title.padEnd(width - 2)} │`);
  console.log(`├${border}┤`);
  console.log(`│ ${content.padEnd(width - 2)} │`);
  console.log(`└${border}┘`);
}

/**
 * Format the fixed-width startup banner box for a given mode label.
 *
 * Produces the three box-drawing lines used by every entry point's startup
 * banner, e.g. `formatBanner("HTTP")` →
 *
 * ```
 * ╔════════════════════════════════════════════════════════════════╗
 * ║                  AnkiMCP HTTP Server v0.19.0                   ║
 * ╚════════════════════════════════════════════════════════════════╝
 * ```
 *
 * Returns the string (rather than printing) so callers can embed it inside a
 * larger template literal — this keeps HTTP mode's combined banner+config
 * output a single `cli.info` call, and lets tunnel mode print the box on its
 * own. The version is read once via {@link getVersion}.
 *
 * @param label - Mode label inserted between "AnkiMCP" and "Server"
 *   (e.g. `HTTP`, `STDIO`, `Tunnel`).
 */
export function formatBanner(label: string): string {
  const version = getVersion();
  const title = `AnkiMCP ${label} Server v${version}`;
  const innerWidth = 64;
  const padding = Math.floor((innerWidth - title.length) / 2);
  const paddedTitle =
    " ".repeat(padding) +
    title +
    " ".repeat(innerWidth - padding - title.length);

  return `╔════════════════════════════════════════════════════════════════╗
║${paddedTitle}║
╚════════════════════════════════════════════════════════════════╝`;
}

/**
 * Print dimmed/secondary text
 */
export function dim(message: string): void {
  console.log(`${colors.dim}${message}${colors.reset}`);
}

/**
 * Print an error message with red X. When `debug` is true and an `Error` with
 * a stack is provided, the stack trace is also printed (dimmed).
 *
 * Used internally by {@link createCli}; exposed so callers that legitimately
 * need a one-off, debug-less error print (e.g. very early bootstrap before
 * options are parsed) can still use it. Prefer the `Cli.error` closure for
 * everything else — it carries the debug flag explicitly.
 */
export function error(message: string, err?: Error, debug = false): void {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
  if (err && debug && err.stack) {
    console.error(`${colors.dim}${err.stack}${colors.reset}`);
  }
}

/**
 * The user-facing CLI output surface, with the debug flag pre-bound.
 *
 * Construct via {@link createCli} at bootstrap and pass down to consumers.
 * Do NOT create multiple instances per process unless you are testing — the
 * debug flag is a process-wide concern, but binding it via closure keeps the
 * dependency explicit at call sites.
 */
export interface Cli {
  success(message: string): void;
  error(message: string, err?: Error): void;
  warn(message: string): void;
  info(message: string): void;
  blank(): void;
  box(title: string, content: string): void;
  dim(message: string): void;
}

/**
 * Create a {@link Cli} instance with the debug flag bound via closure.
 *
 * @param debug - When true, `cli.error(msg, err)` also prints the stack trace.
 * @returns A {@link Cli} instance — all methods are pre-bound, safe to destructure.
 */
export function createCli(debug: boolean): Cli {
  return {
    success,
    warn,
    info,
    blank,
    box,
    dim,
    error: (message: string, err?: Error) => error(message, err, debug),
  };
}
