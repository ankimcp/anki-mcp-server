import { Test, TestingModule } from "@nestjs/testing";
import { RetrieveMediaFileTool } from "../retrieve-media-file.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import {
  parseToolResult,
  createMockContext,
} from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("RetrieveMediaFileTool", () => {
  let tool: RetrieveMediaFileTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;
  let mockContext: ReturnType<typeof createMockContext>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RetrieveMediaFileTool, AnkiConnectClient],
    }).compile();

    tool = module.get<RetrieveMediaFileTool>(RetrieveMediaFileTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    mockContext = createMockContext();
    jest.clearAllMocks();
  });

  it("should retrieve existing media file", async () => {
    const params = {
      filename: "existing.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce("base64EncodedFileContent==");

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("retrieveMediaFile", {
      filename: "existing.mp3",
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe("existing.mp3");
    expect(result.data).toBe("base64EncodedFileContent==");
    expect(result.found).toBe(true);
  });

  it("should handle non-existent file", async () => {
    const params = {
      filename: "nonexistent.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce(false);

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(result.success).toBe(true);
    expect(result.found).toBe(false);
    expect(result.data).toBeNull();
    expect(result.message).toContain("not found");
  });

  it("should sanitize path traversal in filename", async () => {
    const params = {
      filename: "../../.bashrc",
    };
    ankiClient.invoke.mockResolvedValueOnce("file-contents-base64");

    const rawResult = await tool.execute(params, mockContext);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("retrieveMediaFile", {
      filename: ".bashrc",
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe(".bashrc");
  });

  it("should pass normal filenames through unchanged", async () => {
    const params = {
      filename: "pronunciation.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce("base64data");

    await tool.execute(params, mockContext);

    expect(ankiClient.invoke).toHaveBeenCalledWith("retrieveMediaFile", {
      filename: "pronunciation.mp3",
    });
  });

  it("should report progress", async () => {
    const params = {
      filename: "test.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce("base64Data");

    await tool.execute(params, mockContext);

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
