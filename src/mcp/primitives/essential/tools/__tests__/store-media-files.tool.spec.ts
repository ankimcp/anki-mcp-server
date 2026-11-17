import { Test, TestingModule } from "@nestjs/testing";
import { StoreMediaFilesTool } from "../store-media-files.tool";
import {
  AnkiConnectClient,
  AnkiConnectError,
  ReadOnlyModeError,
} from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";
import {
  MEDIA_FILE_NOT_FOUND_HINT,
  MEDIA_FILE_TYPE_HINT,
  MEDIA_FILENAME_HINT,
  MEDIA_IMPORT_DIR_HINT,
  MEDIA_IMPORT_DIR_NOT_FOUND_HINT,
  READ_ONLY_HINT,
} from "@/mcp/utils/anki.utils";
import * as dns from "node:dns";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

jest.mock("@/mcp/clients/anki-connect.client");

jest.mock("node:dns", () => {
  const actual = jest.requireActual("node:dns");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      lookup: jest.fn(),
    },
  };
});

const mockLookup = dns.promises.lookup as unknown as jest.MockedFunction<
  (
    hostname: string,
    options: dns.LookupAllOptions,
  ) => Promise<dns.LookupAddress[]>
>;

describe("StoreMediaFilesTool", () => {
  let tool: StoreMediaFilesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let tmpRoot: string;

  const createFile = (relativePath: string): string => {
    const filePath = path.join(tmpRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "test-content");
    return filePath;
  };

  beforeAll(() => {
    tmpRoot = fs.realpathSync(
      fs.mkdtempSync(path.join(os.tmpdir(), "store-media-files-")),
    );
  });

  afterAll(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [StoreMediaFilesTool, AnkiConnectClient],
    }).compile();

    tool = module.get<StoreMediaFilesTool>(StoreMediaFilesTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;

    jest.clearAllMocks();
    mockLookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  });

  it("should store multiple media files across base64, path, and URL", async () => {
    const localImage = createFile("photos/card.jpg");
    ankiClient.invoke
      .mockResolvedValueOnce("clip.mp3")
      .mockResolvedValueOnce("card.jpg")
      .mockResolvedValueOnce("remote.mp3");

    const rawResult = await tool.execute({
      files: [
        { filename: "clip.mp3", data: "SUQz" },
        { filename: "card.jpg", path: localImage },
        { filename: "remote.mp3", url: "https://cdn.example.com/remote.mp3" },
      ],
    });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.totalRequested).toBe(3);
    expect(result.stored).toBe(3);
    expect(result.failed).toBe(0);
    expect(result.results).toEqual([
      {
        index: 0,
        status: "stored",
        filename: "clip.mp3",
        prefixedWithUnderscore: false,
      },
      {
        index: 1,
        status: "stored",
        filename: "card.jpg",
        prefixedWithUnderscore: false,
      },
      {
        index: 2,
        status: "stored",
        filename: "remote.mp3",
        prefixedWithUnderscore: false,
      },
    ]);

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "storeMediaFile", {
      filename: "clip.mp3",
      data: "SUQz",
      deleteExisting: true,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "storeMediaFile", {
      filename: "card.jpg",
      path: localImage,
      deleteExisting: true,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(3, "storeMediaFile", {
      filename: "remote.mp3",
      url: "https://cdn.example.com/remote.mp3",
      deleteExisting: true,
    });
  });

  it("should respect batch deleteExisting default and per-file override", async () => {
    ankiClient.invoke
      .mockResolvedValueOnce("a.mp3")
      .mockResolvedValueOnce("b.mp3");

    await tool.execute({
      deleteExisting: false,
      files: [
        { filename: "a.mp3", data: "SUQz" },
        { filename: "b.mp3", data: "SUQz", deleteExisting: true },
      ],
    });

    expect(ankiClient.invoke).toHaveBeenNthCalledWith(1, "storeMediaFile", {
      filename: "a.mp3",
      data: "SUQz",
      deleteExisting: false,
    });
    expect(ankiClient.invoke).toHaveBeenNthCalledWith(2, "storeMediaFile", {
      filename: "b.mp3",
      data: "SUQz",
      deleteExisting: true,
    });
  });

  it("should detect underscore prefix on stored filenames", async () => {
    ankiClient.invoke.mockResolvedValueOnce("_keep.mp3");

    const rawResult = await tool.execute({
      files: [{ filename: "_keep.mp3", data: "SUQz" }],
    });
    const result = parseToolResult(rawResult);

    expect(result.results[0]).toEqual({
      index: 0,
      status: "stored",
      filename: "_keep.mp3",
      prefixedWithUnderscore: true,
    });
  });

  it("should support partial success when individual items fail validation or transfer", async () => {
    const missingPath = path.join(tmpRoot, "missing/clip.mp3");
    ankiClient.invoke
      .mockResolvedValueOnce("good1.mp3")
      .mockRejectedValueOnce(
        new AnkiConnectError("disk full", "storeMediaFile"),
      )
      .mockResolvedValueOnce("good2.mp3");

    const rawResult = await tool.execute({
      files: [
        { filename: "good1.mp3", data: "SUQz" },
        { filename: "../../evil.jpg", data: "SUQz" },
        { filename: "secret.txt", path: "/home/user/.ssh/id_rsa" },
        { filename: "missing.mp3", path: missingPath },
        { filename: "fail-anki.mp3", data: "SUQz" },
        { filename: "local.mp3", url: "file:///etc/passwd" },
        { filename: "good2.mp3", data: "SUQz" },
      ],
    });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.totalRequested).toBe(7);
    expect(result.stored).toBe(2);
    expect(result.failed).toBe(5);

    expect(result.results[0]).toEqual({
      index: 0,
      status: "stored",
      filename: "good1.mp3",
      prefixedWithUnderscore: false,
    });
    expect(result.results[1]).toEqual({
      index: 1,
      status: "failed",
      filename: "../../evil.jpg",
      error: expect.stringContaining("Invalid media filename"),
      hint: MEDIA_FILENAME_HINT,
    });
    expect(result.results[2]).toEqual({
      index: 2,
      status: "failed",
      filename: "secret.txt",
      error: expect.stringContaining("Only media files"),
      hint: MEDIA_FILE_TYPE_HINT,
    });
    expect(result.results[3]).toEqual({
      index: 3,
      status: "failed",
      filename: "missing.mp3",
      error: expect.stringContaining("does not exist"),
      hint: MEDIA_FILE_NOT_FOUND_HINT,
    });
    expect(result.results[4]).toEqual({
      index: 4,
      status: "failed",
      filename: "fail-anki.mp3",
      error: expect.stringContaining("disk full"),
    });
    expect(result.results[5]).toEqual({
      index: 5,
      status: "failed",
      filename: "local.mp3",
      error: expect.stringContaining('URL scheme "file" is not allowed'),
    });
    expect(result.results[6]).toEqual({
      index: 6,
      status: "stored",
      filename: "good2.mp3",
      prefixedWithUnderscore: false,
    });
  });

  it("should block private URLs per entry while allowing valid entries", async () => {
    mockLookup
      .mockResolvedValueOnce([{ address: "192.168.1.50", family: 4 }])
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }]);
    ankiClient.invoke.mockResolvedValueOnce("public.mp3");

    const rawResult = await tool.execute({
      files: [
        { filename: "priv.mp3", url: "https://internal.local/priv.mp3" },
        { filename: "public.mp3", url: "https://cdn.example.com/public.mp3" },
      ],
    });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.stored).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toContain("private/internal networks");
    expect(result.results[1].status).toBe("stored");
  });

  it("should report success=false when every item fails", async () => {
    ankiClient.invoke.mockResolvedValueOnce(null);

    const rawResult = await tool.execute({
      files: [{ filename: "a.mp3" }, { filename: "b.mp3", data: "SUQz" }],
    });
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(false);
    expect(result.stored).toBe(0);
    expect(result.failed).toBe(2);
  });

  it("should attach MEDIA_IMPORT_DIR_HINT for outside-dir path failure", async () => {
    const originalEnv = process.env.MEDIA_IMPORT_DIR;
    try {
      const importDir = path.join(tmpRoot, "allowed");
      fs.mkdirSync(importDir, { recursive: true });
      process.env.MEDIA_IMPORT_DIR = importDir;

      const outsideFile = createFile("outside/clip.mp3");
      const rawResult = await tool.execute({
        files: [{ filename: "clip.mp3", path: outsideFile }],
      });
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.failed).toBe(1);
      expect(result.results[0].hint).toBe(MEDIA_IMPORT_DIR_HINT);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MEDIA_IMPORT_DIR;
      } else {
        process.env.MEDIA_IMPORT_DIR = originalEnv;
      }
    }
  });

  it("should fail at the batch level in read-only mode", async () => {
    ankiClient.invoke.mockRejectedValueOnce(
      new ReadOnlyModeError("storeMediaFile"),
    );

    const rawResult = await tool.execute({
      files: [
        { filename: "a.mp3", data: "SUQz" },
        { filename: "b.mp3", data: "SUQz" },
      ],
    });
    const result = parseToolResult(rawResult);

    expect(rawResult).toHaveProperty("isError", true);
    expect(result.success).toBe(false);
    expect(result.error).toContain("read-only mode");
    expect(result.hint).toBe(READ_ONLY_HINT);
    expect(ankiClient.invoke).toHaveBeenCalledTimes(1);
  });

  it("should fail at the batch level when MEDIA_IMPORT_DIR does not exist", async () => {
    const originalEnv = process.env.MEDIA_IMPORT_DIR;
    try {
      process.env.MEDIA_IMPORT_DIR = path.join(tmpRoot, "nonexistent-dir");
      const rawResult = await tool.execute({
        files: [{ filename: "a.mp3", path: path.join(tmpRoot, "a.mp3") }],
      });
      const result = parseToolResult(rawResult);

      expect(rawResult).toHaveProperty("isError", true);
      expect(result.success).toBe(false);
      expect(result.hint).toBe(MEDIA_IMPORT_DIR_NOT_FOUND_HINT);
    } finally {
      if (originalEnv === undefined) {
        delete process.env.MEDIA_IMPORT_DIR;
      } else {
        process.env.MEDIA_IMPORT_DIR = originalEnv;
      }
    }
  });
});
