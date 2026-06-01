/**
 * CLI Spinner Utility
 *
 * Lightweight text spinner for indicating async progress in CLI flows.
 * Separate from {@link ./cli-output} so callers that only need progress
 * indication don't pull in the full CLI output surface.
 */

/**
 * Display a simple text spinner while waiting for an async operation.
 * Returns a function that stops the spinner and clears its line.
 *
 * Frames advance every 80ms. Output goes to stdout via `process.stdout.write`
 * (carriage-returned in place, no newline) so the caller controls surrounding
 * blank lines.
 *
 * @param message - Text shown to the right of the spinner glyph.
 * @returns A `stop` function — call it once the awaited operation settles.
 */
export function startSpinner(message: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;

  const interval = setInterval(() => {
    process.stdout.write(`\r${frames[i]} ${message}`);
    i = (i + 1) % frames.length;
  }, 80);

  return () => {
    clearInterval(interval);
    process.stdout.write("\r"); // Clear spinner line
  };
}
