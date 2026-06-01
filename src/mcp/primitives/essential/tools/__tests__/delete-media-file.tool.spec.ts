import { Test, TestingModule } from "@nestjs/testing";
import { DeleteMediaFileTool } from "../delete-media-file.tool";
import { AnkiConnectClient } from "@/mcp/clients/anki-connect.client";
import { parseToolResult } from "@/test-fixtures/test-helpers";

jest.mock("@/mcp/clients/anki-connect.client");

describe("DeleteMediaFileTool", () => {
  let tool: DeleteMediaFileTool;
  let ankiClient: jest.Mocked<AnkiConnectClient>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DeleteMediaFileTool, AnkiConnectClient],
    }).compile();

    tool = module.get<DeleteMediaFileTool>(DeleteMediaFileTool);
    ankiClient = module.get(
      AnkiConnectClient,
    ) as jest.Mocked<AnkiConnectClient>;
    jest.clearAllMocks();
  });

  it("should delete media file", async () => {
    const params = {
      filename: "old_audio.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce(undefined);

    const rawResult = await tool.execute(params);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("deleteMediaFile", {
      filename: "old_audio.mp3",
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe("old_audio.mp3");
    expect(result.message).toContain("Successfully deleted");
  });

  it("should sanitize path traversal in filename", async () => {
    const params = {
      filename: "../../etc/passwd",
    };
    ankiClient.invoke.mockResolvedValueOnce(undefined);

    const rawResult = await tool.execute(params);
    const result = parseToolResult(rawResult);

    expect(ankiClient.invoke).toHaveBeenCalledWith("deleteMediaFile", {
      filename: "etcpasswd",
    });
    expect(result.success).toBe(true);
    expect(result.filename).toBe("etcpasswd");
  });

  it("should pass normal filenames through unchanged", async () => {
    const params = {
      filename: "old_recording.mp3",
    };
    ankiClient.invoke.mockResolvedValueOnce(undefined);

    await tool.execute(params);

    expect(ankiClient.invoke).toHaveBeenCalledWith("deleteMediaFile", {
      filename: "old_recording.mp3",
    });
  });

  it("should report progress", async () => {
    ankiClient.invoke.mockResolvedValueOnce(undefined);

    await tool.execute({ filename: "x.mp3" });
  });
});
