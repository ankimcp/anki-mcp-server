// Hoisted mocks for `handleTunnel` auto-login branch.
//
// The full happy path of `handleTunnel` requires a real NestJS context, WS
// client, etc. — out of scope here. These tests verify the credential-gate
// behaviour: missing credentials trigger `performLogin()`, failures translate
// via the same helper used by `handleLogin`.
//
// After the cli-output refactor, debug behaviour is an explicit dependency:
// each test constructs its own stub `Cli` and passes it in. There is no
// module-level state to leak between tests or across spec files.

const mockLoadCredentials = jest.fn();
const mockCredentialsServiceInstance = {
  loadCredentials: mockLoadCredentials,
};

jest.mock("@/tunnel", () => {
  class DeviceFlowError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message);
      this.name = "DeviceFlowError";
    }
  }
  class TunnelClientError extends Error {
    constructor(
      message: string,
      public readonly code: string,
    ) {
      super(message);
      this.name = "TunnelClientError";
    }
  }
  return {
    CredentialsService: jest
      .fn()
      .mockImplementation(() => mockCredentialsServiceInstance),
    DeviceFlowService: jest.fn().mockImplementation(() => ({})),
    DeviceFlowError,
    TunnelClient: jest.fn(),
    TunnelClientError,
  };
});

jest.mock("../perform-login", () => ({
  performLogin: jest.fn(),
  translateDeviceFlowError: jest.fn(
    (err: { message: string }) => `translated: ${err.message}`,
  ),
}));

jest.mock("@/app-config.service", () => ({
  AppConfigService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/config", () => ({
  loadValidatedConfig: jest.fn(() => ({ tunnel: { serverUrl: "wss://x" } })),
}));

jest.mock("@nestjs/core", () => ({
  NestFactory: {
    // Force step 2 to fail so we abort right after the credential gate.
    // `handleTunnel` then calls process.exit(1), which our spy converts to a
    // throw — letting Jest observe both that performLogin ran and that we
    // didn't proceed further.
    createApplicationContext: jest.fn().mockImplementation(() => {
      throw new Error("stop-here");
    }),
  },
}));

jest.mock("@nestjs/common", () => ({
  Logger: class {
    static overrideLogger = jest.fn();
    log = jest.fn();
    error = jest.fn();
    warn = jest.fn();
    debug = jest.fn();
  },
}));

jest.mock("@/bootstrap", () => ({
  createPinoLogger: jest.fn(() => ({})),
  createLoggerService: jest.fn(() => ({})),
  LOG_DESTINATION: { STDERR: "stderr", STDOUT: "stdout" },
}));

jest.mock("@/app.module", () => ({
  AppModule: { forTunnel: jest.fn(() => ({})) },
}));

jest.mock("@/tunnel/tunnel-mcp.service", () => ({
  TunnelMcpService: class {},
}));

import { handleTunnel } from "../tunnel.command";
import { performLogin, translateDeviceFlowError } from "../perform-login";
import { loadValidatedConfig } from "@/config";
import { DeviceFlowError } from "@/tunnel";
import type { Cli } from "@/cli/cli-output";

const mockedPerformLogin = performLogin as jest.MockedFunction<
  typeof performLogin
>;
const mockedTranslate = translateDeviceFlowError as jest.MockedFunction<
  typeof translateDeviceFlowError
>;
const mockedLoadConfig = loadValidatedConfig as jest.MockedFunction<
  typeof loadValidatedConfig
>;

/**
 * Build a fresh stub `Cli` per test. All methods are jest mocks so assertions
 * are easy, and the stub is fully isolated — no shared state across tests.
 */
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

/**
 * Pretend stdout is a TTY for tests that exercise the interactive login path.
 * Under Jest, `process.stdout.isTTY` is normally `undefined`, which would
 * otherwise trip the Fix #3 non-interactive guard and short-circuit before
 * `performLogin` runs.
 */
function withTty(value: boolean | undefined): () => void {
  const original = process.stdout.isTTY;
  Object.defineProperty(process.stdout, "isTTY", {
    value,
    configurable: true,
    writable: true,
  });
  return () => {
    Object.defineProperty(process.stdout, "isTTY", {
      value: original,
      configurable: true,
      writable: true,
    });
  };
}

describe("handleTunnel - credential gate", () => {
  let exitSpy: jest.SpyInstance;
  let cli: jest.Mocked<Cli>;
  let restoreTty: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    cli = makeStubCli();
    // Default to TTY for the bulk of tests — the non-interactive branch has
    // its own dedicated test below.
    restoreTty = withTty(true);

    exitSpy = jest.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("exit");
    }) as never);
  });

  afterEach(() => {
    restoreTty();
    jest.restoreAllMocks();
  });

  it("passes tunnelUrl through to loadValidatedConfig (so device flow targets the right host)", async () => {
    mockLoadCredentials.mockResolvedValueOnce({ access_token: "t" });
    // Step 2 throws via mocked NestFactory, which exits.
    await expect(
      handleTunnel(cli, "wss://custom.example.com", false, false),
    ).rejects.toThrow("exit");

    expect(mockedLoadConfig).toHaveBeenCalledWith({
      debug: false,
      readOnly: false,
      tunnel: "wss://custom.example.com",
    });
  });

  it("does NOT call performLogin when credentials already exist", async () => {
    mockLoadCredentials.mockResolvedValueOnce({ access_token: "t" });
    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedPerformLogin).not.toHaveBeenCalled();
  });

  it("auto-triggers performLogin when credentials are missing", async () => {
    mockLoadCredentials.mockResolvedValueOnce(null);
    mockedPerformLogin.mockResolvedValueOnce({
      access_token: "new-t",
    } as never);

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedPerformLogin).toHaveBeenCalledTimes(1);
    // Verify the same service instances are passed (loose coupling: caller
    // owns the lifecycle). The `cli` stub is also threaded through so
    // performLogin doesn't pull from any module-level fallback.
    const passed = mockedPerformLogin.mock.calls[0][0];
    expect(passed.credentialsService).toBe(mockCredentialsServiceInstance);
    expect(passed.deviceFlowService).toBeDefined();
    expect(passed.cli).toBe(cli);
  });

  it("translates DeviceFlowError from auto-login and exits 1", async () => {
    mockLoadCredentials.mockResolvedValueOnce(null);
    const err = new DeviceFlowError("denied", "access_denied");
    mockedPerformLogin.mockRejectedValueOnce(err);

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedTranslate).toHaveBeenCalledWith(err);
    expect(cli.error).toHaveBeenCalledWith(`translated: denied`);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("formats generic errors from auto-login and exits 1", async () => {
    mockLoadCredentials.mockResolvedValueOnce(null);
    mockedPerformLogin.mockRejectedValueOnce(new Error("disk full"));

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedTranslate).not.toHaveBeenCalled();
    // Generic-error path uses `cli.error(message, errorInstance)` so the stub
    // sees both the message and the Error object.
    expect(cli.error).toHaveBeenCalledWith(
      expect.stringContaining("disk full"),
      expect.any(Error),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

describe("handleTunnel - non-interactive fast-fail (Fix #3)", () => {
  let exitSpy: jest.SpyInstance;
  let cli: jest.Mocked<Cli>;
  let restoreTty: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    cli = makeStubCli();
    // Pretend we're running headless (systemd, Docker without -it, CI).
    restoreTty = withTty(undefined);

    exitSpy = jest.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("exit");
    }) as never);
  });

  afterEach(() => {
    restoreTty();
    jest.restoreAllMocks();
  });

  it("does NOT start device flow when missing credentials in a non-TTY environment", async () => {
    mockLoadCredentials.mockResolvedValueOnce(null);

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    // The fast-fail path must not call performLogin (which would otherwise
    // hang the user's container/service for ~10 minutes polling a token).
    expect(mockedPerformLogin).not.toHaveBeenCalled();
    expect(cli.error).toHaveBeenCalledWith(
      expect.stringMatching(/non-interactively/i),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
