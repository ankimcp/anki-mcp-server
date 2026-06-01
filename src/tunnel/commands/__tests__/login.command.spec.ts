// Mocks must be declared before module imports that depend on them.
jest.mock("../perform-login", () => ({
  performLogin: jest.fn(),
  translateDeviceFlowError: jest.fn(
    (err: { message: string }) => `translated: ${err.message}`,
  ),
}));

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
  return {
    CredentialsService: jest.fn().mockImplementation(() => ({})),
    DeviceFlowService: jest.fn().mockImplementation(() => ({})),
    DeviceFlowError,
  };
});

jest.mock("@/app-config.service", () => ({
  AppConfigService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("@/config", () => ({
  loadValidatedConfig: jest.fn(() => ({ tunnel: { serverUrl: "wss://x" } })),
}));

import { handleLogin } from "../login.command";
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

describe("handleLogin", () => {
  let exitSpy: jest.SpyInstance;
  let cli: jest.Mocked<Cli>;

  beforeEach(() => {
    jest.clearAllMocks();
    cli = makeStubCli();

    // process.exit throws so we can stop execution and assert it was called.
    exitSpy = jest.spyOn(process, "exit").mockImplementation(((
      _code?: number,
    ) => {
      throw new Error("exit");
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("passes the tunnelUrl through to loadValidatedConfig", async () => {
    mockedPerformLogin.mockResolvedValueOnce({} as never);

    await handleLogin(cli, "wss://custom.example.com");

    expect(mockedLoadConfig).toHaveBeenCalledWith({
      tunnel: "wss://custom.example.com",
    });
    expect(mockedPerformLogin).toHaveBeenCalledTimes(1);
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("threads the cli stub through to performLogin", async () => {
    mockedPerformLogin.mockResolvedValueOnce({} as never);

    await handleLogin(cli);

    const passed = mockedPerformLogin.mock.calls[0][0];
    expect(passed.cli).toBe(cli);
  });

  it("returns normally on success without calling process.exit", async () => {
    mockedPerformLogin.mockResolvedValueOnce({} as never);

    await expect(handleLogin(cli)).resolves.toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("translates DeviceFlowError and exits 1", async () => {
    const err = new DeviceFlowError("denied", "access_denied");
    mockedPerformLogin.mockRejectedValueOnce(err);

    await expect(handleLogin(cli)).rejects.toThrow("exit");

    expect(mockedTranslate).toHaveBeenCalledWith(err);
    expect(cli.error).toHaveBeenCalledWith("translated: denied");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("formats generic errors and exits 1", async () => {
    mockedPerformLogin.mockRejectedValueOnce(new Error("boom"));

    await expect(handleLogin(cli)).rejects.toThrow("exit");

    expect(mockedTranslate).not.toHaveBeenCalled();
    expect(cli.error).toHaveBeenCalledWith(
      expect.stringContaining("boom"),
      expect.any(Error),
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
