import * as fs from "fs";
import * as path from "path";
import { Reflector } from "@nestjs/core";
import { MCP_TOOL_METADATA_KEY } from "@rekog/mcp-nest";
import { z } from "zod";
import { ESSENTIAL_MCP_TOOLS } from "@/mcp/primitives/essential";
import { GUI_MCP_TOOLS } from "@/mcp/primitives/gui";
import { MCP_SERVER_INSTRUCTIONS } from "@/mcp/mcp-instructions";

/**
 * Guards the directory-policy convention: tool descriptions, parameter
 * descriptions and the server instructions state facts about the tools
 * rather than give orders to the model, and every tool carries the full set
 * of annotations. Metadata is read off the real @Tool decorators of every
 * controller the modules register, so new tools are covered automatically.
 */

const CASE_SENSITIVE_MARKERS = [
  "IMPORTANT:",
  "CRITICAL:",
  "DO NOT",
  "ALWAYS",
  "NEVER",
  "Use sync tool FIRST",
  "WORKFLOW:",
];
const CASE_INSENSITIVE_MARKERS = ["wait for user"];

interface RegisteredTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  annotations?: Record<string, unknown>;
}

function collectTools(
  controllers: ReadonlyArray<new (...args: any[]) => unknown>,
) {
  const reflector = new Reflector();
  const tools: RegisteredTool[] = [];
  for (const controller of controllers) {
    const proto = controller.prototype;
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key === "constructor") continue;
      const options = reflector.get(MCP_TOOL_METADATA_KEY, proto[key]);
      if (options) tools.push(options as RegisteredTool);
    }
  }
  return tools;
}

function collectDescriptions(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((item) => collectDescriptions(item, out));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "description" && typeof value === "string") out.push(value);
      else collectDescriptions(value, out);
    }
  }
  return out;
}

function findMarkers(text: string): string[] {
  const lower = text.toLowerCase();
  return [
    ...CASE_SENSITIVE_MARKERS.filter((m) => text.includes(m)),
    ...CASE_INSENSITIVE_MARKERS.filter((m) => lower.includes(m)),
  ];
}

const tools = collectTools([...ESSENTIAL_MCP_TOOLS, ...GUI_MCP_TOOLS]);

const manifestTools: Array<{ name: string; description: string }> = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../../../../manifest.json"), "utf-8"),
).tools;

describe("tool metadata policy", () => {
  it("discovers the registered tools, including every GUI tool", () => {
    const guiTools = collectTools(GUI_MCP_TOOLS);
    expect(guiTools).toHaveLength(GUI_MCP_TOOLS.length);
    expect(tools.length).toBeGreaterThan(guiTools.length);
  });

  it("lists exactly the registered tools in manifest.json", () => {
    const registered = tools.map((t) => t.name).sort();
    const listed = manifestTools.map((t) => t.name).sort();
    expect(listed).toHaveLength(registered.length);
    expect(listed).toEqual(registered);
  });

  it("has no order-style marker phrases in manifest.json tool descriptions", () => {
    const found = manifestTools.flatMap((t) =>
      findMarkers(t.description).map((marker) => `${t.name}: ${marker}`),
    );
    expect(found).toEqual([]);
  });

  describe.each(tools.map((t) => [t.name, t] as const))("%s", (_name, tool) => {
    it("has no order-style marker phrases in its description", () => {
      expect(findMarkers(tool.description)).toEqual([]);
    });

    it("has no order-style marker phrases in its parameter descriptions", () => {
      const schema = z.toJSONSchema(tool.parameters, {
        unrepresentable: "any",
      });
      const found = collectDescriptions(schema).flatMap(findMarkers);
      expect(found).toEqual([]);
    });

    it("declares title, readOnlyHint, destructiveHint and openWorldHint", () => {
      const annotations = tool.annotations ?? {};
      expect(typeof annotations.title).toBe("string");
      expect(typeof annotations.readOnlyHint).toBe("boolean");
      expect(typeof annotations.destructiveHint).toBe("boolean");
      expect(typeof annotations.openWorldHint).toBe("boolean");
    });

    it("is never both read-only and destructive", () => {
      const annotations = tool.annotations ?? {};
      if (annotations.readOnlyHint === true) {
        expect(annotations.destructiveHint).toBe(false);
      }
    });
  });

  it("server instructions contain no order-style marker phrases", () => {
    expect(MCP_SERVER_INSTRUCTIONS.length).toBeGreaterThan(0);
    expect(findMarkers(MCP_SERVER_INSTRUCTIONS)).toEqual([]);
  });
});
