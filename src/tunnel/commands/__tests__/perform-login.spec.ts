import {
  performLogin,
  reportLoginError,
  translateDeviceFlowError,
} from "../perform-login";
import {
  CredentialsService,
  DeviceFlowError,
  DeviceFlowService,
  type DeviceCodeResponse,
  type TokenResponse,
  type TunnelCredentials,
} from "@/tunnel";
import type { Cli } from "@/cli/cli-output";

// Mock child_process so openBrowser doesn't actually spawn a browser process
// in tests. After the shell-injection fix, openBrowser uses `execFile` (argv
// array, no shell) via `promisify(execFile)`, so the mocked callback signature
// is `(file, args, cb)` — different from the prior `exec` signature.
const mockExecFile = jest.fn(
  (
    _file: string,
    _args: readonly string[],
    cb: (err: unknown, stdout: string, stderr: string) => void,
  ) => cb(null, "", ""),
);

jest.mock("child_process", () => ({
  execFile: (...args: unknown[]) =>
    (
      mockExecFile as unknown as (
        ...a: unknown[]
      ) => ReturnType<typeof mockExecFile>
    )(...args),
}));

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

describe("translateDeviceFlowError", () => {
  it("returns a timeout message for expired_token", () => {
    const err = new DeviceFlowError("x", "expired_token");
    expect(translateDeviceFlowError(err)).toMatch(/timed out/i);
    expect(translateDeviceFlowError(err)).toMatch(/--login/);
  });

  it("returns a denied message for access_denied", () => {
    const err = new DeviceFlowError("x", "access_denied");
    expect(translateDeviceFlowError(err)).toMatch(/denied/i);
    expect(translateDeviceFlowError(err)).toMatch(/--login/);
  });

  it("returns a network message for network_error", () => {
    const err = new DeviceFlowError("x", "network_error");
    expect(translateDeviceFlowError(err)).toMatch(/connect/i);
    expect(translateDeviceFlowError(err)).toMatch(/internet/i);
  });

  it("returns a network message for timeout", () => {
    const err = new DeviceFlowError("x", "timeout");
    expect(translateDeviceFlowError(err)).toMatch(/connect/i);
  });

  it("falls back to a generic message for unknown codes", () => {
    const err = new DeviceFlowError("boom", "weird_code");
    expect(translateDeviceFlowError(err)).toMatch(/Authentication failed/);
    expect(translateDeviceFlowError(err)).toMatch(/boom/);
  });
});

describe("reportLoginError", () => {
  let cli: jest.Mocked<Cli>;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    cli = makeStubCli();
    // Spy as a no-op (NOT a throw): reportLoginError must only PRINT, never
    // terminate the process. If it ever called exit, the assertions below
    // would catch it without killing the Jest worker.
    exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders a DeviceFlowError via translateDeviceFlowError (single message arg)", () => {
    const err = new DeviceFlowError("denied", "access_denied");

    reportLoginError(cli, err);

    // Exact wording the real translateDeviceFlowError produces for this code —
    // pins that reportLoginError delegates to it for DeviceFlowErrors.
    expect(cli.error).toHaveBeenCalledTimes(1);
    expect(cli.error).toHaveBeenCalledWith(
      "Authentication was denied. Please try again with 'ankimcp --login'",
    );
    // The DeviceFlow branch passes no second (Error) argument.
    expect(cli.error.mock.calls[0]).toHaveLength(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("renders a generic Error as `Login failed: <msg>` with the Error forwarded as 2nd arg", () => {
    const err = new Error("boom");

    reportLoginError(cli, err);

    expect(cli.error).toHaveBeenCalledTimes(1);
    expect(cli.error).toHaveBeenCalledWith("Login failed: boom", err);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("stringifies a non-Error value and forwards no Error argument", () => {
    reportLoginError(cli, "weird");

    expect(cli.error).toHaveBeenCalledWith("Login failed: weird", undefined);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("performLogin", () => {
  let credentialsService: jest.Mocked<CredentialsService>;
  let deviceFlowService: jest.Mocked<DeviceFlowService>;
  let cli: jest.Mocked<Cli>;

  const deviceCode: DeviceCodeResponse = {
    device_code: "dev-123",
    user_code: "USER-CODE",
    verification_uri: "https://auth.example.com/device",
    verification_uri_complete: "https://auth.example.com/device?code=USER-CODE",
    expires_in: 600,
    interval: 5,
  };

  const tokenResponse: TokenResponse = {
    access_token: "access-abc",
    refresh_token: "refresh-xyz",
    token_type: "Bearer",
    expires_in: 3600,
    user: {
      id: "user-1",
      email: "alice@example.com",
      tier: "free",
    },
  };

  beforeEach(() => {
    credentialsService = {
      saveCredentials: jest.fn().mockResolvedValue(undefined),
      getCredentialsPath: jest.fn().mockReturnValue("/tmp/credentials.json"),
    } as unknown as jest.Mocked<CredentialsService>;

    deviceFlowService = {
      requestDeviceCode: jest.fn().mockResolvedValue(deviceCode),
      pollForToken: jest.fn().mockResolvedValue(tokenResponse),
    } as unknown as jest.Mocked<DeviceFlowService>;

    cli = makeStubCli();
    mockExecFile.mockClear();

    // Silence direct stdout writes from the spinner during tests
    jest.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the saved credentials on success", async () => {
    const result = await performLogin({
      credentialsService,
      deviceFlowService,
      cli,
    });

    expect(deviceFlowService.requestDeviceCode).toHaveBeenCalledTimes(1);
    expect(deviceFlowService.pollForToken).toHaveBeenCalledWith(
      deviceCode.device_code,
      deviceCode.interval,
      deviceCode.expires_in,
    );
    expect(credentialsService.saveCredentials).toHaveBeenCalledTimes(1);

    const saved = credentialsService.saveCredentials.mock
      .calls[0][0] as TunnelCredentials;
    expect(saved.access_token).toBe(tokenResponse.access_token);
    expect(saved.refresh_token).toBe(tokenResponse.refresh_token);
    expect(saved.user).toEqual(tokenResponse.user);
    expect(typeof saved.expires_at).toBe("string");

    expect(result).toEqual(saved);
  });

  it("opens the browser via execFile with the URL passed as an argv element (no shell)", async () => {
    await performLogin({ credentialsService, deviceFlowService, cli });

    expect(mockExecFile).toHaveBeenCalledTimes(1);
    const [file, args] = mockExecFile.mock.calls[0];
    // The URL must travel as a separate argv element — never interpolated into
    // a shell command string — so shell metacharacters cannot execute.
    expect(typeof file).toBe("string");
    expect(Array.isArray(args)).toBe(true);
    expect(args).toContain(deviceCode.verification_uri_complete);
  });

  it("routes user-facing output exclusively through the injected cli", async () => {
    await performLogin({ credentialsService, deviceFlowService, cli });

    // The success path prints several info lines, success, and blanks.
    expect(cli.info).toHaveBeenCalled();
    expect(cli.success).toHaveBeenCalledWith("Authentication successful");
    expect(cli.blank).toHaveBeenCalled();
  });

  it("propagates DeviceFlowError from requestDeviceCode without calling save", async () => {
    const err = new DeviceFlowError("denied", "access_denied");
    deviceFlowService.requestDeviceCode.mockRejectedValueOnce(err);

    await expect(
      performLogin({ credentialsService, deviceFlowService, cli }),
    ).rejects.toBe(err);
    expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
  });

  it("propagates DeviceFlowError from pollForToken without calling save", async () => {
    const err = new DeviceFlowError("expired", "expired_token");
    deviceFlowService.pollForToken.mockRejectedValueOnce(err);

    await expect(
      performLogin({ credentialsService, deviceFlowService, cli }),
    ).rejects.toBe(err);
    expect(credentialsService.saveCredentials).not.toHaveBeenCalled();
  });

  it("propagates filesystem errors from saveCredentials", async () => {
    const fsErr = new Error("EACCES");
    credentialsService.saveCredentials.mockRejectedValueOnce(fsErr);

    await expect(
      performLogin({ credentialsService, deviceFlowService, cli }),
    ).rejects.toBe(fsErr);
  });

  it("does not call process.exit on any error path", async () => {
    const exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation(((_code?: number) => undefined) as never);

    deviceFlowService.requestDeviceCode.mockRejectedValueOnce(
      new DeviceFlowError("nope", "access_denied"),
    );

    await expect(
      performLogin({ credentialsService, deviceFlowService, cli }),
    ).rejects.toBeInstanceOf(DeviceFlowError);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
