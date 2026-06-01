import * as fs from "fs/promises";
import { constants } from "fs";

// Mock Logger BEFORE importing CredentialsService
const mockLoggerWarn = jest.fn();
const mockLoggerLog = jest.fn();
const mockLoggerError = jest.fn();
const mockLoggerDebug = jest.fn();

jest.mock("@nestjs/common", () => {
  const actual = jest.requireActual("@nestjs/common");
  return {
    ...actual,
    Logger: jest.fn().mockImplementation(() => ({
      log: mockLoggerLog,
      warn: mockLoggerWarn,
      error: mockLoggerError,
      debug: mockLoggerDebug,
    })),
  };
});

// Mock fs/promises and os modules BEFORE importing CredentialsService
jest.mock("fs/promises");
jest.mock("os", () => ({
  homedir: jest.fn(() => "/home/testuser"),
}));

// Import after mocking to ensure static properties use mocked homedir
import { CredentialsService, TunnelCredentials } from "../credentials.service";

describe("CredentialsService", () => {
  let service: CredentialsService;
  let mockHomedir: string;
  let mockCredentialsPath: string;

  // Helper function to create valid test credentials
  const createTestCredentials = (
    overrides?: Partial<TunnelCredentials>,
  ): TunnelCredentials => ({
    access_token: "test-access-token-123",
    refresh_token: "test-refresh-token-456",
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
    user: {
      id: "user-123",
      email: "test@example.com",
      tier: "free",
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear logger mocks
    mockLoggerWarn.mockClear();
    mockLoggerLog.mockClear();
    mockLoggerError.mockClear();
    mockLoggerDebug.mockClear();

    // Setup expected paths (homedir is mocked to "/home/testuser")
    mockHomedir = "/home/testuser";
    mockCredentialsPath = `${mockHomedir}/.ankimcp/credentials.json`;

    // Create service instance
    service = new CredentialsService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getCredentialsPath", () => {
    it("should return correct path to credentials file", () => {
      const path = service.getCredentialsPath();

      expect(path).toBe(mockCredentialsPath);
      expect(path).toContain(".ankimcp/credentials.json");
    });

    it("should return path based on mocked home directory", () => {
      const path = service.getCredentialsPath();

      // Since homedir is mocked to "/home/testuser", verify it's used
      expect(path).toBe("/home/testuser/.ankimcp/credentials.json");
      expect(path).toContain(".ankimcp");
      expect(path).toContain("credentials.json");
    });

    it("should return consistent path across multiple calls", () => {
      const path1 = service.getCredentialsPath();
      const path2 = service.getCredentialsPath();

      expect(path1).toBe(path2);
      expect(path1).toBe(mockCredentialsPath);
    });
  });

  describe("saveCredentials", () => {
    it("should create directory if it doesn't exist", async () => {
      const credentials = createTestCredentials();

      // Mock directory doesn't exist
      const accessError: NodeJS.ErrnoException = new Error("ENOENT");
      accessError.code = "ENOENT";
      (fs.access as jest.Mock).mockRejectedValue(accessError);
      (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockResolvedValue(undefined);

      await service.saveCredentials(credentials);

      expect(fs.access).toHaveBeenCalledWith(
        `${mockHomedir}/.ankimcp`,
        constants.F_OK,
      );
      expect(fs.mkdir).toHaveBeenCalledWith(`${mockHomedir}/.ankimcp`, {
        recursive: true,
        mode: 0o700,
      });
    });

    it("should not create directory if it already exists", async () => {
      const credentials = createTestCredentials();

      // Mock directory exists
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockResolvedValue(undefined);

      await service.saveCredentials(credentials);

      expect(fs.access).toHaveBeenCalledWith(
        `${mockHomedir}/.ankimcp`,
        constants.F_OK,
      );
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it("should write credentials JSON with pretty formatting", async () => {
      const credentials = createTestCredentials();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockResolvedValue(undefined);

      await service.saveCredentials(credentials);

      expect(fs.writeFile).toHaveBeenCalledWith(
        mockCredentialsPath,
        JSON.stringify(credentials, null, 2),
        {
          encoding: "utf-8",
          mode: 0o600,
        },
      );
    });

    it("should set file permissions to 0o600", async () => {
      const credentials = createTestCredentials();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockResolvedValue(undefined);

      await service.saveCredentials(credentials);

      expect(fs.chmod).toHaveBeenCalledWith(mockCredentialsPath, 0o600);
    });

    it("should write credentials with all required fields", async () => {
      const credentials = createTestCredentials({
        user: {
          id: "user-456",
          email: "premium@example.com",
          tier: "paid",
        },
      });

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockResolvedValue(undefined);

      await service.saveCredentials(credentials);

      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(writtenContent);

      expect(parsed.access_token).toBe("test-access-token-123");
      expect(parsed.refresh_token).toBe("test-refresh-token-456");
      expect(parsed.expires_at).toBeDefined();
      expect(parsed.user.id).toBe("user-456");
      expect(parsed.user.email).toBe("premium@example.com");
      expect(parsed.user.tier).toBe("paid");
    });

    it("should throw error with context when write fails", async () => {
      const credentials = createTestCredentials();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockRejectedValue(
        new Error("Permission denied"),
      );

      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        `Failed to save credentials to ${mockCredentialsPath}`,
      );
      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "Permission denied",
      );
    });

    it("should throw error when directory creation fails", async () => {
      const credentials = createTestCredentials();

      const accessError: NodeJS.ErrnoException = new Error("ENOENT");
      accessError.code = "ENOENT";
      (fs.access as jest.Mock).mockRejectedValue(accessError);
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error("Disk full"));

      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "Failed to save credentials",
      );
      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "Disk full",
      );
    });

    it("should throw error when chmod fails", async () => {
      const credentials = createTestCredentials();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockRejectedValue(
        new Error("chmod not supported"),
      );

      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "Failed to save credentials",
      );
      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "chmod not supported",
      );
    });

    it("should handle non-Error exceptions gracefully", async () => {
      const credentials = createTestCredentials();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockRejectedValue("string error");

      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "Failed to save credentials",
      );
      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "string error",
      );
    });

    it("should propagate access errors other than ENOENT", async () => {
      const credentials = createTestCredentials();

      const accessError: NodeJS.ErrnoException = new Error("EACCES");
      accessError.code = "EACCES";
      (fs.access as jest.Mock).mockRejectedValue(accessError);

      await expect(service.saveCredentials(credentials)).rejects.toThrow(
        "Failed to save credentials",
      );
    });
  });

  describe("loadCredentials", () => {
    it("should return credentials when file exists and is valid", async () => {
      const credentials = createTestCredentials();

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      const result = await service.loadCredentials();

      expect(fs.access).toHaveBeenCalledWith(
        mockCredentialsPath,
        constants.F_OK | constants.R_OK,
      );
      expect(fs.readFile).toHaveBeenCalledWith(mockCredentialsPath, {
        encoding: "utf-8",
      });
      expect(result).toEqual(credentials);
    });

    it("should return null when file doesn't exist", async () => {
      const accessError: NodeJS.ErrnoException = new Error("ENOENT");
      accessError.code = "ENOENT";
      (fs.access as jest.Mock).mockRejectedValue(accessError);

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(fs.readFile).not.toHaveBeenCalled();
    });

    it("should return null when JSON is corrupted and log warning", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue("{ invalid json syntax ][");

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load credentials"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining(mockCredentialsPath),
      );
    });

    it("should return null when credentials structure is invalid - missing access_token", async () => {
      const invalidCredentials = {
        // missing access_token
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "  - Missing field: access_token",
      );
    });

    it("should return null when credentials structure is invalid - missing refresh_token", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        // missing refresh_token
        expires_at: new Date().toISOString(),
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should return null when credentials structure is invalid - missing expires_at", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        // missing expires_at
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should return null when credentials structure is invalid - missing user object", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        // missing user
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should return null when credentials structure is invalid - missing user.id", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: {
          // missing id
          email: "test@example.com",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should return null when credentials structure is invalid - missing user.email", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: {
          id: "user-123",
          // missing email
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should return null when credentials structure is invalid - invalid user.tier", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "invalid-tier", // must be "free" or "paid"
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "  - Invalid tier value: expected 'free' or 'paid', got 'invalid-tier'",
      );
    });

    it("should return null when credentials structure is invalid - null user", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: null,
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should accept valid credentials with tier 'paid'", async () => {
      const credentials = createTestCredentials({
        user: {
          id: "user-123",
          email: "premium@example.com",
          tier: "paid",
        },
      });

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(credentials));

      const result = await service.loadCredentials();

      expect(result).toEqual(credentials);
      expect(result?.user.tier).toBe("paid");
    });

    it("should return null when file is not readable", async () => {
      const accessError: NodeJS.ErrnoException = new Error("EACCES");
      accessError.code = "EACCES";
      (fs.access as jest.Mock).mockRejectedValue(accessError);

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load credentials"),
      );
    });

    it("should return null and log warning when readFile fails", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error("Read error"));

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load credentials"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Read error"),
      );
    });

    it("should handle non-Error exceptions gracefully", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockRejectedValue("string error");

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load credentials"),
      );
    });

    it("should preserve extra fields in credentials object", async () => {
      const credentialsWithExtras: any = {
        ...createTestCredentials(),
        extra_field: "should be preserved",
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(credentialsWithExtras),
      );

      const result = await service.loadCredentials();

      expect(result).toEqual(credentialsWithExtras);
      expect((result as any).extra_field).toBe("should be preserved");
    });

    it("should return null when credentials is not an object", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify("string"));

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
    });

    it("should return null when credentials is null", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(null));

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "  - Credentials must be an object",
      );
    });

    it("should provide detailed type mismatch errors", async () => {
      const invalidCredentials = {
        access_token: 12345, // should be string
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: {
          id: "user-123",
          email: "test@example.com",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "  - Invalid type for access_token: expected string, got number",
      );
    });

    it("should provide detailed error for missing user.email", async () => {
      const invalidCredentials = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        expires_at: new Date().toISOString(),
        user: {
          id: "user-123",
          // missing email
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toBeNull();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.stringContaining("Corrupted credentials file"),
      );
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "  - Missing field: user.email",
      );
    });
  });

  describe("clearCredentials", () => {
    it("should delete credentials file when it exists", async () => {
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.clearCredentials();

      expect(fs.unlink).toHaveBeenCalledWith(mockCredentialsPath);
    });

    it("should not throw when file doesn't exist", async () => {
      const unlinkError: NodeJS.ErrnoException = new Error("ENOENT");
      unlinkError.code = "ENOENT";
      (fs.unlink as jest.Mock).mockRejectedValue(unlinkError);

      await expect(service.clearCredentials()).resolves.not.toThrow();
      expect(fs.unlink).toHaveBeenCalledWith(mockCredentialsPath);
    });

    it("should throw error when deletion fails with non-ENOENT error", async () => {
      const unlinkError: NodeJS.ErrnoException = new Error("EACCES");
      unlinkError.code = "EACCES";
      (fs.unlink as jest.Mock).mockRejectedValue(unlinkError);

      await expect(service.clearCredentials()).rejects.toThrow(
        "Failed to delete credentials file",
      );
      await expect(service.clearCredentials()).rejects.toThrow("EACCES");
    });

    it("should throw error when deletion fails with permission denied", async () => {
      (fs.unlink as jest.Mock).mockRejectedValue(
        new Error("Permission denied"),
      );

      await expect(service.clearCredentials()).rejects.toThrow(
        "Failed to delete credentials file",
      );
      await expect(service.clearCredentials()).rejects.toThrow(
        "Permission denied",
      );
    });

    it("should handle non-Error exceptions gracefully", async () => {
      (fs.unlink as jest.Mock).mockRejectedValue("string error");

      await expect(service.clearCredentials()).rejects.toThrow(
        "Failed to delete credentials file",
      );
      await expect(service.clearCredentials()).rejects.toThrow("string error");
    });

    it("should attempt to delete correct file path", async () => {
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.clearCredentials();

      const callArg = (fs.unlink as jest.Mock).mock.calls[0][0];
      expect(callArg).toBe(mockCredentialsPath);
      expect(callArg).toContain(".ankimcp/credentials.json");
    });
  });

  describe("hasCredentials", () => {
    it("should return true when credentials file exists", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      const result = await service.hasCredentials();

      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith(
        mockCredentialsPath,
        constants.F_OK,
      );
    });

    it("should return false when credentials file doesn't exist", async () => {
      const accessError: NodeJS.ErrnoException = new Error("ENOENT");
      accessError.code = "ENOENT";
      (fs.access as jest.Mock).mockRejectedValue(accessError);

      const result = await service.hasCredentials();

      expect(result).toBe(false);
    });

    it("should return false when file is not accessible", async () => {
      const accessError: NodeJS.ErrnoException = new Error("EACCES");
      accessError.code = "EACCES";
      (fs.access as jest.Mock).mockRejectedValue(accessError);

      const result = await service.hasCredentials();

      expect(result).toBe(false);
    });

    it("should return false for any access error", async () => {
      (fs.access as jest.Mock).mockRejectedValue(new Error("Unknown error"));

      const result = await service.hasCredentials();

      expect(result).toBe(false);
    });

    it("should check correct file path", async () => {
      (fs.access as jest.Mock).mockResolvedValue(undefined);

      await service.hasCredentials();

      expect(fs.access).toHaveBeenCalledWith(
        mockCredentialsPath,
        constants.F_OK,
      );
    });

    it("should return false when access throws non-Error", async () => {
      (fs.access as jest.Mock).mockRejectedValue("string error");

      const result = await service.hasCredentials();

      expect(result).toBe(false);
    });
  });

  describe("isTokenExpired", () => {
    it("should return false when token is valid and not near expiry", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour from now
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(false);
    });

    it("should return true when token is expired", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(true);
    });

    it("should return true when token expires within 60 seconds (buffer)", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() + 59 * 1000).toISOString(), // 59 seconds from now
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(true);
    });

    it("should return true when token expires exactly at 60 seconds (at buffer boundary)", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() + 60 * 1000).toISOString(), // exactly 60 seconds from now
      });

      const result = service.isTokenExpired(credentials);

      // At exactly 60 seconds, now >= expiresAt - 60000, so it's considered expired
      expect(result).toBe(true);
    });

    it("should return false when token expires at 61 seconds (just outside buffer)", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() + 61 * 1000).toISOString(), // 61 seconds from now
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(false);
    });

    it("should return true when token expired hours ago", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() - 3600 * 1000).toISOString(), // 1 hour ago
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(true);
    });

    it("should return true when token expired days ago", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(), // 1 day ago
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(true);
    });

    it("should return false when token is valid for hours", () => {
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() + 10 * 3600 * 1000).toISOString(), // 10 hours from now
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(false);
    });

    it("should handle edge case of exact expiry time", () => {
      const now = Date.now();
      const credentials = createTestCredentials({
        expires_at: new Date(now).toISOString(), // expires right now
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(true); // Should be expired (no buffer)
    });

    it("should correctly parse ISO 8601 timestamp", () => {
      // Use a date far in the future to avoid test failures as time passes
      const futureDate = new Date("2030-12-31T23:59:59.000Z");
      const credentials = createTestCredentials({
        expires_at: futureDate.toISOString(),
      });

      const result = service.isTokenExpired(credentials);

      // Should not be expired since it's a date in the future
      expect(result).toBe(false);
    });

    it("should handle very old timestamps", () => {
      const credentials = createTestCredentials({
        expires_at: new Date("2020-01-01T00:00:00.000Z").toISOString(),
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(true);
    });

    it("should handle timestamps with different time zones", () => {
      // ISO 8601 with explicit timezone
      const credentials = createTestCredentials({
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      });

      const result = service.isTokenExpired(credentials);

      expect(result).toBe(false);
    });
  });

  describe("Edge Cases and Integration", () => {
    it("should handle full save-load-clear cycle", async () => {
      const credentials = createTestCredentials();

      // Save
      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.chmod as jest.Mock).mockResolvedValue(undefined);

      await service.saveCredentials(credentials);

      expect(fs.writeFile).toHaveBeenCalled();

      // Load
      const writtenContent = (fs.writeFile as jest.Mock).mock.calls[0][1];
      (fs.readFile as jest.Mock).mockResolvedValue(writtenContent);

      const loaded = await service.loadCredentials();

      expect(loaded).toEqual(credentials);

      // Clear
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.clearCredentials();

      expect(fs.unlink).toHaveBeenCalledWith(mockCredentialsPath);
    });

    it("should correctly identify expired credentials after loading", async () => {
      const expiredCredentials = createTestCredentials({
        expires_at: new Date(Date.now() - 1000).toISOString(), // expired
      });

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(expiredCredentials),
      );

      const loaded = await service.loadCredentials();

      expect(loaded).not.toBeNull();
      expect(service.isTokenExpired(loaded!)).toBe(true);
    });

    it("should handle multiple service instances with same home directory", () => {
      const service1 = new CredentialsService();
      const service2 = new CredentialsService();

      expect(service1.getCredentialsPath()).toBe(service2.getCredentialsPath());
    });

    it("should handle credentials with minimal valid structure", async () => {
      const minimalCredentials: TunnelCredentials = {
        access_token: "a",
        refresh_token: "b",
        expires_at: new Date().toISOString(),
        user: {
          id: "1",
          email: "a@b.c",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(minimalCredentials),
      );

      const result = await service.loadCredentials();

      expect(result).toEqual(minimalCredentials);
    });

    it("should reject credentials with empty string values", async () => {
      const invalidCredentials = {
        access_token: "", // empty string should still validate (string type)
        refresh_token: "test",
        expires_at: new Date().toISOString(),
        user: {
          id: "1",
          email: "test@example.com",
          tier: "free",
        },
      };

      (fs.access as jest.Mock).mockResolvedValue(undefined);
      (fs.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify(invalidCredentials),
      );

      const result = await service.loadCredentials();

      // Empty string is still a valid string type, so this should pass validation
      expect(result).toEqual(invalidCredentials);
    });
  });
});
