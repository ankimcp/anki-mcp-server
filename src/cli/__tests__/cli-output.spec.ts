import {
  success,
  error,
  warn,
  info,
  blank,
  box,
  dim,
  createCli,
} from "../cli-output";

describe("CLI Output Utility", () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    // No module-level debug state to reset — that was the whole point of the
    // refactor. Each test that cares about debug behaviour constructs its own
    // `createCli(debug)` instance below.
  });

  describe("success()", () => {
    it("should print message with green checkmark to console.log", () => {
      success("Test success");
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✓"));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test success"),
      );
      // Verify it contains ANSI green color code
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[32m"),
      );
    });
  });

  describe("error()", () => {
    it("should print message with red X to console.error", () => {
      error("Test error");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("✗"),
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test error"),
      );
      // Verify it contains ANSI red color code
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[31m"),
      );
    });

    it("defaults debug to false: stack trace omitted when debug param not passed", () => {
      const testError = new Error("Test error with stack");
      error("Test error", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Only the message, no stack
    });

    it("should not show stack trace when debug=false", () => {
      const testError = new Error("Test error with stack");
      error("Test error", testError, false);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("should show stack trace when debug=true", () => {
      const testError = new Error("Test error with stack");
      error("Test error", testError, true);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Message + stack
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("Error: Test error with stack"),
      );
    });

    it("should not show stack trace when error object is not provided (even with debug=true)", () => {
      error("Test error", undefined, true);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("should not show stack trace when error object has no stack (even with debug=true)", () => {
      const testError = new Error("Test error");
      delete testError.stack;
      error("Test error", testError, true);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("warn()", () => {
    it("should print message with yellow exclamation to console.warn", () => {
      warn("Test warning");
      expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("!"));
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Test warning"),
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[33m"),
      );
    });
  });

  describe("info()", () => {
    it("should print message without icon to console.log", () => {
      info("Test info");
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith("Test info");
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("✓"),
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("✗"),
      );
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("!"),
      );
    });
  });

  describe("blank()", () => {
    it("should print empty line to console.log", () => {
      blank();
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith();
    });
  });

  describe("box()", () => {
    it("should print boxed message with title and content", () => {
      box("Title", "Content here");
      expect(consoleLogSpy).toHaveBeenCalledTimes(5); // Top, title, middle, content, bottom

      const calls = consoleLogSpy.mock.calls.map((call) => call[0]);

      expect(calls[0]).toContain("┌");
      expect(calls[0]).toContain("─");
      expect(calls[0]).toContain("┐");

      expect(calls[1]).toContain("│");
      expect(calls[1]).toContain("Title");
      expect(calls[1]).toContain("│");

      expect(calls[2]).toContain("├");
      expect(calls[2]).toContain("─");
      expect(calls[2]).toContain("┤");

      expect(calls[3]).toContain("│");
      expect(calls[3]).toContain("Content here");
      expect(calls[3]).toContain("│");

      expect(calls[4]).toContain("└");
      expect(calls[4]).toContain("─");
      expect(calls[4]).toContain("┘");
    });

    it("should handle content longer than title", () => {
      box("Hi", "This is much longer content");
      expect(consoleLogSpy).toHaveBeenCalledTimes(5);

      const calls = consoleLogSpy.mock.calls.map((call) => call[0]);

      const widths = calls.map((line) => line.length);
      expect(new Set(widths).size).toBe(1); // All widths should be equal
    });
  });

  describe("dim()", () => {
    it("should print dimmed/secondary text to console.log", () => {
      dim("Secondary text");
      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Secondary text"),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[2m"),
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[0m"),
      );
    });
  });

  describe("createCli()", () => {
    it("returns an object exposing the full Cli surface", () => {
      const cli = createCli(false);
      expect(typeof cli.success).toBe("function");
      expect(typeof cli.error).toBe("function");
      expect(typeof cli.warn).toBe("function");
      expect(typeof cli.info).toBe("function");
      expect(typeof cli.blank).toBe("function");
      expect(typeof cli.box).toBe("function");
      expect(typeof cli.dim).toBe("function");
    });

    it("delegates success/info/warn/blank/box/dim to the pure functions", () => {
      const cli = createCli(false);

      cli.success("ok");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✓"));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("ok"));

      cli.info("hello");
      expect(consoleLogSpy).toHaveBeenCalledWith("hello");

      cli.warn("careful");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("careful"),
      );
    });

    it("error() with debug=false in factory does not print stack trace", () => {
      const cli = createCli(false);
      const testError = new Error("boom");
      cli.error("oops", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("error() with debug=true in factory prints stack trace", () => {
      const cli = createCli(true);
      const testError = new Error("boom");
      cli.error("oops", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("Error: boom"),
      );
    });

    it("two instances are independent: debug flag is closed over, not shared", () => {
      const cliDebug = createCli(true);
      const cliQuiet = createCli(false);
      const testError = new Error("boom");

      cliQuiet.error("a", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // no stack

      cliDebug.error("b", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(3); // 1 + (msg + stack) = 3
    });

    it("methods are safe to destructure (closure-bound, no `this`)", () => {
      const { error: errorFn } = createCli(true);
      const testError = new Error("boom");
      errorFn("standalone", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });
  });
});
