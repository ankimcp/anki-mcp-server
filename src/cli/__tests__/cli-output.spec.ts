import {
  success,
  error,
  warn,
  info,
  blank,
  box,
  dim,
  cli,
  setDebugMode,
  isDebugMode,
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
    // Reset debug mode after each test
    setDebugMode(false);
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

    it("should not show stack trace when debug mode is off", () => {
      const testError = new Error("Test error with stack");
      error("Test error", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Only the message, no stack
    });

    it("should show stack trace when debug mode is on", () => {
      setDebugMode(true);
      const testError = new Error("Test error with stack");
      error("Test error", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2); // Message + stack
      // Second call should contain the stack trace
      expect(consoleErrorSpy).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("Error: Test error with stack"),
      );
    });

    it("should not show stack trace when error object is not provided", () => {
      setDebugMode(true);
      error("Test error");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Only the message
    });

    it("should not show stack trace when error object has no stack", () => {
      setDebugMode(true);
      const testError = new Error("Test error");
      delete testError.stack;
      error("Test error", testError);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1); // Only the message
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
      // Verify it contains ANSI yellow color code
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
      // Should not contain icons
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

      // Verify box drawing characters
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

      // All lines should have same width (based on content length)
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
      // Verify it contains ANSI dim color code
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[2m"),
      );
      // Verify reset code is present
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("\x1b[0m"),
      );
    });
  });

  describe("cli namespace", () => {
    it("should export all functions in cli namespace", () => {
      expect(cli.success).toBe(success);
      expect(cli.error).toBe(error);
      expect(cli.warn).toBe(warn);
      expect(cli.info).toBe(info);
      expect(cli.blank).toBe(blank);
      expect(cli.box).toBe(box);
      expect(cli.dim).toBe(dim);
      expect(cli.setDebugMode).toBe(setDebugMode);
      expect(cli.isDebugMode).toBe(isDebugMode);
    });

    it("should allow calling via namespace", () => {
      cli.success("Namespace test");
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("✓"));
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining("Namespace test"),
      );
    });
  });

  describe("debug mode", () => {
    it("should start with debug mode off", () => {
      expect(isDebugMode()).toBe(false);
    });

    it("should allow enabling debug mode", () => {
      setDebugMode(true);
      expect(isDebugMode()).toBe(true);
    });

    it("should allow disabling debug mode", () => {
      setDebugMode(true);
      setDebugMode(false);
      expect(isDebugMode()).toBe(false);
    });
  });
});
