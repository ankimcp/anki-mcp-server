/**
 * CLI Output Utility
 *
 * Use this for user-facing CLI output (clean, no timestamps).
 * For logging (errors, debug, warnings), use Pino logger instead.
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

/**
 * Print success message with green checkmark
 */
export function success(message: string): void {
  console.log(`${colors.green}✓${colors.reset} ${message}`);
}

/**
 * Print error message with red X
 */
export function error(message: string): void {
  console.error(`${colors.red}✗${colors.reset} ${message}`);
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
  const border = '─'.repeat(width);

  console.log(`┌${border}┐`);
  console.log(`│ ${title.padEnd(width - 2)} │`);
  console.log(`├${border}┤`);
  console.log(`│ ${content.padEnd(width - 2)} │`);
  console.log(`└${border}┘`);
}

/**
 * Print dimmed/secondary text
 */
export function dim(message: string): void {
  console.log(`${colors.dim}${message}${colors.reset}`);
}

// Export as namespace for convenient usage: cli.success(), cli.error(), etc.
export const cli = {
  success,
  error,
  warn,
  info,
  blank,
  box,
  dim,
};
