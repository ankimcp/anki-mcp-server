import { Test, TestingModule } from "@nestjs/testing";
import { GuiUndoTool } from "../gui-undo.tool";
import { AnkiConnectClient } from "../../../../clients/anki-connect.client";
import { parseToolResult } from "../../../../../test-fixtures/test-helpers";

const mockAnkiClient = {
  invoke: jest.fn(),
};

describe("GuiUndoTool", () => {
  let tool: GuiUndoTool;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuiUndoTool,
        {
          provide: AnkiConnectClient,
          useValue: mockAnkiClient,
        },
      ],
    }).compile();

    tool = module.get<GuiUndoTool>(GuiUndoTool);
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(tool).toBeDefined();
  });

  describe("guiUndo", () => {
    it("should successfully undo last action", async () => {
      mockAnkiClient.invoke.mockResolvedValue(true);

      const rawResult = await tool.guiUndo({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.undone).toBe(true);
      expect(result.message).toContain("Last action undone successfully");
      expect(mockAnkiClient.invoke).toHaveBeenCalledWith("guiUndo");
    });

    it("should handle nothing to undo (returns false)", async () => {
      mockAnkiClient.invoke.mockResolvedValue(false);

      const rawResult = await tool.guiUndo({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(true);
      expect(result.undone).toBe(false);
      expect(result.message).toContain("Nothing to undo");
    });

    it("should handle errors", async () => {
      const error = new Error("Undo failed");
      mockAnkiClient.invoke.mockRejectedValue(error);

      const rawResult = await tool.guiUndo({});
      const result = parseToolResult(rawResult);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Undo failed");
    });
  });
});
