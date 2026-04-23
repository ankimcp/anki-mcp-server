import { Test, TestingModule } from "@nestjs/testing";
import { GetMediaFilesNamesTool } from "../get-media-files-names.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("GetMediaFilesNamesTool", () => {
  let tool: GetMediaFilesNamesTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GetMediaFilesNamesTool, AnkiConnectClient],
    }).compile();

    tool = module.get<GetMediaFilesNamesTool>(GetMediaFilesNamesTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should list all media files without pattern", async () => {
    const mockFiles = ["audio1.mp3", "audio2.mp3", "image1.jpg"];
    ankiClient.invoke.mockResolvedValueOnce(mockFiles);

    const rawResult = await tool.execute({}, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("getMediaFilesNames", {});
    expect(result.success).toBe(true);
    expect(result.files).toEqual(mockFiles);
    expect(result.count).toBe(3);
  });

  it("should list media files with pattern", async () => {
    const mockFiles = ["audio1.mp3", "audio2.mp3"];
    ankiClient.invoke.mockResolvedValueOnce(mockFiles);

    const rawResult = await tool.execute({ pattern: "*.mp3" }, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("getMediaFilesNames", {
      pattern: "*.mp3",
    });
    expect(result.success).toBe(true);
    expect(result.files).toEqual(mockFiles);
    expect(result.count).toBe(2);
    expect(result.pattern).toBe("*.mp3");
  });

  it("should handle empty file list", async () => {
    ankiClient.invoke.mockResolvedValueOnce([]);

    const rawResult = await tool.execute({}, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.files).toEqual([]);
    expect(result.count).toBe(0);
  });

  it("should report progress", async () => {
    ankiClient.invoke.mockResolvedValueOnce([]);

    await tool.execute({}, mockContext);

    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 50,
      total: 100,
    });
    expect(mockContext.reportProgress).toHaveBeenCalledWith({
      progress: 100,
      total: 100,
    });
  });
});
