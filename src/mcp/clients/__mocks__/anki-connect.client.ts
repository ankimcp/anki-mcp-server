// Manual mock for AnkiConnectClient
export const AnkiConnectClient = jest.fn().mockImplementation(() => ({
  invoke: jest.fn(),
}));

export class AnkiConnectError extends Error {
  constructor(
    message: string,
    public readonly action?: string,
    public readonly originalError?: string,
  ) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

export class ReadOnlyModeError extends Error {
  constructor(public readonly action: string) {
    super(
      `Action "${action}" is blocked: server is running in read-only mode. ` +
        `Write operations are disabled. Remove the --read-only flag to enable writes.`,
    );
    this.name = "ReadOnlyModeError";
  }
}
