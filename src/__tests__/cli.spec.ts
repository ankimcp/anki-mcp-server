import {
  parseCliArgs,
  parseOptionalUrl,
  CliOptions,
  displayStartupBanner,
} from "../cli";
import { createCli, type Cli } from "../cli/cli-output";
import * as fs from "fs";
import * as path from "path";

// Mock update-notifier to avoid ESM issues in Jest
jest.mock("update-notifier", () => ({
  default: jest.fn(() => ({ notify: jest.fn() })),
}));

describe("CLI Module", () => {
  // Store original process.argv
  const originalArgv = process.argv;

  afterEach(() => {
    // Restore original argv after each test
    process.argv = originalArgv;
  });

  describe("parseCliArgs", () => {
    it("should return default options when no arguments provided", () => {
      process.argv = ["node", "ankimcp"];

      const options = parseCliArgs();

      expect(options).toEqual({
        port: 3000,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      });
    });

    it("should parse custom port option", () => {
      process.argv = ["node", "ankimcp", "--port", "8080"];

      const options = parseCliArgs();

      expect(options.port).toBe(8080);
      expect(options.host).toBe("127.0.0.1"); // defaults
      expect(options.ankiConnect).toBe("http://localhost:8765"); // defaults
    });

    it("should parse short form port option", () => {
      process.argv = ["node", "ankimcp", "-p", "9000"];

      const options = parseCliArgs();

      expect(options.port).toBe(9000);
    });

    it("should parse custom host option", () => {
      process.argv = ["node", "ankimcp", "--host", "0.0.0.0"];

      const options = parseCliArgs();

      expect(options.host).toBe("0.0.0.0");
      expect(options.port).toBe(3000); // defaults
      expect(options.ankiConnect).toBe("http://localhost:8765"); // defaults
    });

    it("should parse short form host option", () => {
      process.argv = ["node", "ankimcp", "-h", "192.168.1.100"];

      const options = parseCliArgs();

      expect(options.host).toBe("192.168.1.100");
    });

    it("should parse custom anki-connect URL", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--anki-connect",
        "http://192.168.1.50:8765",
      ];

      const options = parseCliArgs();

      expect(options.ankiConnect).toBe("http://192.168.1.50:8765");
      expect(options.port).toBe(3000); // defaults
      expect(options.host).toBe("127.0.0.1"); // defaults
    });

    it("should parse short form anki-connect option", () => {
      process.argv = ["node", "ankimcp", "-a", "http://example.com:8765"];

      const options = parseCliArgs();

      expect(options.ankiConnect).toBe("http://example.com:8765");
    });

    it("should parse all options together", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--port",
        "4000",
        "--host",
        "0.0.0.0",
        "--anki-connect",
        "http://custom-host:9999",
      ];

      const options = parseCliArgs();

      expect(options).toEqual({
        port: 4000,
        host: "0.0.0.0",
        ankiConnect: "http://custom-host:9999",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      });
    });

    it("should convert port string to number", () => {
      process.argv = ["node", "ankimcp", "--port", "8080"];

      const options = parseCliArgs();

      expect(typeof options.port).toBe("number");
      expect(options.port).toBe(8080);
    });

    it("should handle numeric port values", () => {
      process.argv = ["node", "ankimcp", "--port", "3000"];

      const options = parseCliArgs();

      expect(options.port).toBe(3000);
    });

    it("should parse --read-only flag", () => {
      process.argv = ["node", "ankimcp", "--read-only"];

      const options = parseCliArgs();

      expect(options.readOnly).toBe(true);
      expect(options.port).toBe(3000); // defaults
      expect(options.host).toBe("127.0.0.1"); // defaults
    });

    it("should parse --tunnel flag alone as true", () => {
      process.argv = ["node", "ankimcp", "--tunnel"];

      const options = parseCliArgs();

      expect(options.tunnel).toBe(true);
      expect(options.port).toBe(3000); // defaults
      expect(options.host).toBe("127.0.0.1"); // defaults
    });

    it("should parse --read-only with other options", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--port",
        "8080",
        "--read-only",
        "--ngrok",
      ];

      const options = parseCliArgs();

      expect(options.readOnly).toBe(true);
      expect(options.ngrok).toBe(true);
      expect(options.port).toBe(8080);
    });

    it("should parse --tunnel with custom URL as string", () => {
      process.argv = ["node", "ankimcp", "--tunnel", "ws://localhost:3004"];

      const options = parseCliArgs();

      expect(options.tunnel).toBe("ws://localhost:3004");
    });

    it("should parse --tunnel with custom WebSocket URL", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--tunnel",
        "wss://custom-tunnel.example.com",
      ];

      const options = parseCliArgs();

      expect(options.tunnel).toBe("wss://custom-tunnel.example.com");
    });

    it("should parse --tunnel with URL argument", () => {
      process.argv = ["node", "ankimcp", "--tunnel", "ws://example.com:8080"];

      const options = parseCliArgs();

      expect(options.tunnel).toBe("ws://example.com:8080");
    });

    it("should parse all options including tunnel", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--port",
        "4000",
        "--host",
        "0.0.0.0",
        "--anki-connect",
        "http://custom-host:9999",
        "--tunnel",
        "wss://tunnel.example.com",
      ];

      const options = parseCliArgs();

      expect(options).toEqual({
        port: 4000,
        host: "0.0.0.0",
        ankiConnect: "http://custom-host:9999",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: "wss://tunnel.example.com",
        debug: false,
      });
    });

    it("should parse --debug flag", () => {
      process.argv = ["node", "ankimcp", "--debug"];

      const options = parseCliArgs();

      expect(options.debug).toBe(true);
    });

    it("should parse -d short form debug flag", () => {
      process.argv = ["node", "ankimcp", "-d"];

      const options = parseCliArgs();

      expect(options.debug).toBe(true);
    });

    it("should parse --debug with other options", () => {
      process.argv = ["node", "ankimcp", "--port", "8080", "--debug"];

      const options = parseCliArgs();

      expect(options.port).toBe(8080);
      expect(options.debug).toBe(true);
    });

    it("should parse --login flag alone as true", () => {
      process.argv = ["node", "ankimcp", "--login"];

      const options = parseCliArgs();

      expect(options.login).toBe(true);
    });

    it("should parse --login with custom URL as string", () => {
      process.argv = [
        "node",
        "ankimcp",
        "--login",
        "wss://custom.server.com/tunnel",
      ];

      const options = parseCliArgs();

      expect(options.login).toBe("wss://custom.server.com/tunnel");
    });

    it("should parse --login with WebSocket URL", () => {
      process.argv = ["node", "ankimcp", "--login", "ws://localhost:3004"];

      const options = parseCliArgs();

      expect(options.login).toBe("ws://localhost:3004");
    });

    it("should parse --logout flag", () => {
      process.argv = ["node", "ankimcp", "--logout"];

      const options = parseCliArgs();

      expect(options.logout).toBe(true);
    });
  });

  describe("getVersion", () => {
    it("should read version from package.json", () => {
      // This test verifies that the version can be read from package.json
      const packageJsonPath = path.join(__dirname, "../../package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      // Verify package.json has a version
      expect(packageJson.version).toBeDefined();
      expect(typeof packageJson.version).toBe("string");
      expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("should handle --version flag", () => {
      process.argv = ["node", "ankimcp", "--version"];

      const writeSpy = jest.spyOn(process.stdout, "write").mockImplementation();
      const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => {
        throw new Error(`process.exit called`);
      }) as never);

      try {
        parseCliArgs();
      } catch (e) {
        // Expect process.exit to be called for --version
        if (!(e instanceof Error && e.message === "process.exit called")) {
          throw e; // Re-throw unexpected errors
        }
      }

      const packageJsonPath = path.join(__dirname, "../../package.json");
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

      // Check that version was written to stdout
      const output = writeSpy.mock.calls.map((call) => call[0]).join("");
      expect(output).toContain(packageJson.version);

      writeSpy.mockRestore();
      exitSpy.mockRestore();
    });
  });

  describe("displayStartupBanner", () => {
    it("should display startup banner with correct information", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 3000,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).toContain("AnkiMCP HTTP Server");
      expect(output).toContain("http://127.0.0.1:3000");
      expect(output).toContain("http://localhost:8765");
      expect(output).toContain("Port:");
      expect(output).toContain("3000");
      expect(output).toContain("Host:");
      expect(output).toContain("127.0.0.1");

      consoleLogSpy.mockRestore();
    });

    it("should display custom options in banner", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 8080,
        host: "0.0.0.0",
        ankiConnect: "http://192.168.1.100:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).toContain("http://0.0.0.0:8080");
      expect(output).toContain("http://192.168.1.100:8765");
      expect(output).toContain("8080");
      expect(output).toContain("0.0.0.0");

      consoleLogSpy.mockRestore();
    });

    it("should include remote-access hint (tunnel recommended, ngrok mentioned)", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 3000,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).toContain("ankimcp --tunnel");
      expect(output).toContain("ngrok");

      consoleLogSpy.mockRestore();
    });

    it("should not show verbose ngrok setup steps", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 8080,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).not.toContain("npm install -g ngrok");
      expect(output).not.toContain("config add-authtoken");

      consoleLogSpy.mockRestore();
    });

    it("should include help command reference", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 3000,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).toContain("ankimcp --help");

      consoleLogSpy.mockRestore();
    });

    it("should show read-only warning when enabled", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 3000,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: true,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).toContain("READ-ONLY MODE ENABLED");
      expect(output).toContain("Read-only");

      consoleLogSpy.mockRestore();
    });

    it("should not show read-only warning when disabled", () => {
      const consoleLogSpy = jest.spyOn(console, "log").mockImplementation();

      const options: CliOptions = {
        port: 3000,
        host: "127.0.0.1",
        ankiConnect: "http://localhost:8765",
        ngrok: false,
        readOnly: false,
        login: false,
        logout: false,
        tunnel: false,
        debug: false,
      };

      displayStartupBanner(createCli(false), options);

      const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");

      expect(output).not.toContain("READ-ONLY MODE ENABLED");

      consoleLogSpy.mockRestore();
    });
  });
});

/**
 * Fix #15: parse-boundary URL validation.
 *
 * The risk being guarded: `--tunnel ""` (e.g. from a shell expansion of an
 * unset env var) is a user-supplied override intent. Silently falling back to
 * the env/default URL is a footgun — these tests pin the strict behaviour.
 */
describe("parseOptionalUrl", () => {
  function makeStubCli(): jest.Mocked<Cli> {
    return {
      success: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      blank: jest.fn(),
      box: jest.fn(),
      dim: jest.fn(),
    };
  }

  let exitSpy: jest.SpyInstance;
  let cli: jest.Mocked<Cli>;

  beforeEach(() => {
    cli = makeStubCli();
    exitSpy = jest.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("exit");
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns undefined when the flag was not passed (raw === false)", () => {
    expect(parseOptionalUrl(false, "--tunnel", cli)).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(cli.error).not.toHaveBeenCalled();
  });

  it("returns undefined when the flag was passed without a value (raw === true)", () => {
    expect(parseOptionalUrl(true, "--tunnel", cli)).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
    expect(cli.error).not.toHaveBeenCalled();
  });

  it("returns a valid ws:// URL unchanged", () => {
    expect(parseOptionalUrl("ws://localhost:3004", "--tunnel", cli)).toBe(
      "ws://localhost:3004",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("returns a valid wss:// URL unchanged", () => {
    expect(parseOptionalUrl("wss://tunnel.ankimcp.ai", "--tunnel", cli)).toBe(
      "wss://tunnel.ankimcp.ai",
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("rejects an empty string (the shell-expansion footgun) with exit 1", () => {
    expect(() => parseOptionalUrl("", "--tunnel", cli)).toThrow("exit");
    expect(cli.error).toHaveBeenCalledWith(
      expect.stringMatching(/Invalid --tunnel URL/),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("rejects a garbage non-URL string with exit 1", () => {
    expect(() => parseOptionalUrl("not a url", "--tunnel", cli)).toThrow(
      "exit",
    );
    expect(cli.error).toHaveBeenCalledWith(
      expect.stringMatching(/Invalid --tunnel URL/),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("rejects a non-ws/wss protocol with exit 1", () => {
    expect(() =>
      parseOptionalUrl("https://tunnel.ankimcp.ai", "--tunnel", cli),
    ).toThrow("exit");
    expect(cli.error).toHaveBeenCalledWith(expect.stringMatching(/protocol/i));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("includes the flag name in the error message for both --tunnel and --login", () => {
    expect(() => parseOptionalUrl("", "--login", cli)).toThrow("exit");
    expect(cli.error).toHaveBeenCalledWith(expect.stringMatching(/--login/));
  });
});
