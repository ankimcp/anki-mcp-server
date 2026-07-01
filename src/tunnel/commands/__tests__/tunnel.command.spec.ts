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

// `reportLoginError` is now imported by `tunnel.command.ts` (auto-login AND
// auto-relogin paths). The factory MUST export it, otherwise it resolves to
// `undefined` and the catch path throws `TypeError: reportLoginError is not a
// function`. The stub mirrors production: a DeviceFlowError is rendered via the
// SAME `translateDeviceFlowError` jest.fn the tests spy on; anything else uses
// the generic `Login failed: <msg>` line with the Error forwarded as the 2nd
// arg. This keeps the existing `mockedTranslate` / `cli.error` assertions valid.
jest.mock("../perform-login", () => {
  const translateDeviceFlowError = jest.fn(
    (err: { message: string }) => `translated: ${err.message}`,
  );
  return {
    performLogin: jest.fn(),
    translateDeviceFlowError,
    reportLoginError: jest.fn(
      (
        cli: { error: (msg: string, err?: unknown) => void },
        error: unknown,
      ) => {
        const { DeviceFlowError } = jest.requireMock("@/tunnel");
        if (error instanceof DeviceFlowError) {
          cli.error(translateDeviceFlowError(error as { message: string }));
        } else {
          cli.error(
            `Login failed: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error : undefined,
          );
        }
      },
    ),
  };
});

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
    // didn't proceed further. The auto-relogin describe block below overrides
    // this per-test to let app creation succeed and reach the connect loop.
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

// Mock the spinner so the connect loop doesn't spin up real `setInterval`
// timers (the auto-relogin success path parks on an unresolved promise, so a
// real interval would leak). Returns a no-op stop function. No existing test
// asserts on spinner behaviour, so this is transparent to them.
jest.mock("@/cli/spinner", () => ({
  startSpinner: jest.fn(() => jest.fn()),
}));

import { NestFactory } from "@nestjs/core";
import { handleTunnel } from "../tunnel.command";
import {
  performLogin,
  reportLoginError,
  translateDeviceFlowError,
} from "../perform-login";
import { loadValidatedConfig } from "@/config";
import { DeviceFlowError, TunnelClient, TunnelClientError } from "@/tunnel";
import type { Cli } from "@/cli/cli-output";

const mockedPerformLogin = performLogin as jest.MockedFunction<
  typeof performLogin
>;
const mockedReportLoginError = reportLoginError as jest.MockedFunction<
  typeof reportLoginError
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

// ---------------------------------------------------------------------------
// Auto-relogin on a session_expired FIRST connect.
//
// Unlike the credential-gate block above (which deliberately fails Nest
// bootstrap to stop right after the gate), these tests must reach Step 4 — the
// `tunnelClient.connect()` loop. To get there we (a) hand back EXISTING but
// stale credentials so the credential gate passes, (b) override the mocked
// NestFactory to RESOLVE a minimal fake app, and (c) give the mocked
// `TunnelClient` constructor a stub with a programmable `connect`.
//
// The happy path of `handleTunnel` never settles (`await new Promise(() =>
// {})`), so the success test cannot `await` the returned promise — it drives
// execution to a checkpoint via `flushUntil` instead. Exit paths DO settle
// (the `process.exit` spy throws), so those use `rejects.toThrow("exit")`.
// ---------------------------------------------------------------------------
describe("handleTunnel - auto-relogin on session_expired (first connect)", () => {
  let exitSpy: jest.SpyInstance;
  let cli: jest.Mocked<Cli>;
  let restoreTty: () => void;
  let tunnelClientStub: {
    on: jest.Mock;
    disconnect: jest.Mock;
    isConnected: jest.Mock;
    connect: jest.Mock;
  };

  const EXISTING_CREDS = { access_token: "stale" };

  function makeTunnelClientStub() {
    return {
      on: jest.fn(),
      disconnect: jest.fn(),
      isConnected: jest.fn(() => false),
      connect: jest.fn(),
    };
  }

  /**
   * Flush pending micro/macro tasks until `predicate` holds (or we give up
   * after `max` iterations). The success path of `handleTunnel` parks on an
   * unresolved promise, so callers cannot `await` it — they pump the event
   * loop to a known checkpoint with this helper instead.
   */
  async function flushUntil(predicate: () => boolean, max = 50): Promise<void> {
    for (let i = 0; i < max && !predicate(); i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  beforeEach(() => {
    jest.clearAllMocks();
    cli = makeStubCli();
    // Interactive by default — the relogin gate requires a TTY. The non-TTY
    // case flips this within the test.
    restoreTty = withTty(true);

    exitSpy = jest.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("exit");
    }) as never);

    // Existing (but possibly stale) credentials so we sail past the credential
    // gate and reach the connect loop — the session_expired path is about a
    // dead refresh token at connect time, NOT missing creds.
    mockLoadCredentials.mockResolvedValue(EXISTING_CREDS);

    // Let app creation succeed so we reach Step 4 (connect). The module-level
    // NestFactory mock throws by default for the earlier describe blocks; here
    // we override it to hand back a minimal fake context.
    const fakeApp = {
      get: jest.fn(() => ({ handleRequest: jest.fn() })),
      close: jest.fn().mockResolvedValue(undefined),
    };
    (NestFactory.createApplicationContext as jest.Mock).mockResolvedValue(
      fakeApp,
    );

    tunnelClientStub = makeTunnelClientStub();
    (TunnelClient as unknown as jest.Mock).mockImplementation(
      () => tunnelClientStub,
    );
  });

  afterEach(() => {
    restoreTty();
    // The success path registers SIGINT/SIGTERM handlers and then parks on an
    // unresolved promise; strip them so listeners don't accumulate across tests.
    process.removeAllListeners("SIGINT");
    process.removeAllListeners("SIGTERM");
    jest.restoreAllMocks();
  });

  it("re-authenticates once and retries connect with the fresh credentials, then succeeds", async () => {
    const sessionErr = new TunnelClientError(
      "session expired",
      "session_expired",
    );
    const freshCreds = { access_token: "fresh" };
    tunnelClientStub.connect
      .mockRejectedValueOnce(sessionErr)
      .mockResolvedValueOnce("https://tunnel.ankimcp.ai/uuid");
    mockedPerformLogin.mockResolvedValueOnce(freshCreds as never);

    // Success path never settles — fire and forget, guard against unhandled.
    const pending = handleTunnel(cli, undefined, false, false);
    pending.catch(() => {});

    await flushUntil(() =>
      cli.success.mock.calls.some((c) => c[0] === "Tunnel established"),
    );

    expect(mockedPerformLogin).toHaveBeenCalledTimes(1);
    expect(tunnelClientStub.connect).toHaveBeenCalledTimes(2);
    // The retry must use exactly the credentials performLogin returned.
    expect(tunnelClientStub.connect.mock.calls[1][0]).toBe(freshCreds);
    expect(cli.success).toHaveBeenCalledWith("Tunnel established");
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("is single-shot: a second session_expired after relogin exits 1 with no second relogin", async () => {
    const sessionErr = new TunnelClientError(
      "session expired",
      "session_expired",
    );
    const sessionErr2 = new TunnelClientError(
      "still expired",
      "session_expired",
    );
    tunnelClientStub.connect
      .mockRejectedValueOnce(sessionErr)
      .mockRejectedValueOnce(sessionErr2)
      // Catch-all: under the correct single-shot guard this never fires (connect
      // is called exactly twice). If the guard regressed, a third connect() would
      // otherwise resolve undefined → park on the success path → 5s timeout; the
      // default rejection makes the regression exit deterministically instead.
      .mockRejectedValue(sessionErr2);
    mockedPerformLogin.mockResolvedValueOnce({
      access_token: "fresh",
    } as never);

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    // Exactly one relogin, exactly two connect attempts, then a clean exit —
    // `reloginAttempted` bounds the loop.
    expect(mockedPerformLogin).toHaveBeenCalledTimes(1);
    expect(tunnelClientStub.connect).toHaveBeenCalledTimes(2);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("reports the login error and exits 1 when the relogin itself fails", async () => {
    const sessionErr = new TunnelClientError(
      "session expired",
      "session_expired",
    );
    const loginErr = new DeviceFlowError("denied", "access_denied");
    tunnelClientStub.connect.mockRejectedValueOnce(sessionErr);
    mockedPerformLogin.mockRejectedValueOnce(loginErr);

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedPerformLogin).toHaveBeenCalledTimes(1);
    // No retry: the connect was attempted once, relogin failed, we bail.
    expect(tunnelClientStub.connect).toHaveBeenCalledTimes(1);
    expect(mockedReportLoginError).toHaveBeenCalledWith(cli, loginErr);
    // reportLoginError renders a DeviceFlowError via translateDeviceFlowError.
    expect(cli.error).toHaveBeenCalledWith("translated: denied");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does NOT relogin in a non-TTY environment — prints the original error and exits 1", async () => {
    // Flip to headless: the relogin gate is TTY-only.
    restoreTty();
    restoreTty = withTty(undefined);

    const sessionErr = new TunnelClientError(
      "session expired",
      "session_expired",
    );
    tunnelClientStub.connect.mockRejectedValueOnce(sessionErr);

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedPerformLogin).not.toHaveBeenCalled();
    expect(tunnelClientStub.connect).toHaveBeenCalledTimes(1);
    // Original error message is surfaced verbatim (no relogin, no reformat).
    expect(cli.error).toHaveBeenCalledWith("session expired");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("takes the formatConnectionError path (no relogin) for a non-session_expired connect error", async () => {
    tunnelClientStub.connect.mockRejectedValueOnce(new Error("boom"));

    await expect(handleTunnel(cli, undefined, false, false)).rejects.toThrow(
      "exit",
    );

    expect(mockedPerformLogin).not.toHaveBeenCalled();
    // formatConnectionError wraps a generic error as `Failed to connect: …`.
    expect(cli.error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to connect"),
      expect.any(Error),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
