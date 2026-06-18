/**
 * E2E tests for DNS-rebinding protection on the HTTP transport.
 *
 * Advisory: GHSA-j9xx-59ph-wmr6 (mirrors the addon's tests/e2e/test_dns_rebinding.py).
 *
 * The CLI's HTTP listener (default 127.0.0.1:3000) performs NO Host-header
 * validation, and its OriginValidationGuard intentionally allows requests that
 * carry no Origin header (the curl/Postman path — see main-http.spec.ts). A
 * DNS-rebound browser issuing *same-origin* requests (Host = an attacker name
 * that resolves to 127.0.0.1, and no Origin header) therefore reaches MCP
 * `initialize` / `tools/call` and can drive the local Anki collection.
 *
 * RED-UNTIL-FIX
 * -------------
 * The attacker-Host cases below are EXPECTED TO FAIL against the current server:
 * with no Host guard the server returns 200 and serves MCP. They turn GREEN once
 * the Host-validation guard is wired in (loopback allowlist + the ALLOWED_HOSTS
 * escape hatch).
 *
 * The loopback cases (allowed / absent Origin -> 200) are regression guards that
 * pass BOTH before and after the fix: they prove local browsers and non-browser
 * clients (curl, MCP-over-HTTP) keep working.
 *
 * The present-but-disallowed-Origin case already passes today (the existing
 * OriginValidationGuard rejects it) — it documents the half of the defense we
 * already have, so it is NOT a red case.
 *
 * These use Node's `http` module — NOT the Inspector CLI used by the other e2e
 * specs, which cannot set arbitrary Host/Origin headers — and parse SSE `data:`
 * frames like the advisory PoC.
 *
 * Requires:
 *   - HTTP server running: npm run start:prod:http  (initialize needs no Anki)
 */
import http from "node:http";
import { URL } from "node:url";

const SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3000";
const PARSED = new URL(SERVER_URL);
const SERVER_HOST = PARSED.hostname || "localhost";
const SERVER_PORT = Number(PARSED.port) || 3000;
// Default config serves the MCP Streamable HTTP endpoint at root.
const MCP_PATH = "/";

// A loopback Host header the allowlist should accept.
const LOOPBACK_HOST = `127.0.0.1:${SERVER_PORT}`;
// An attacker-controlled name that (via rebinding) resolves to the loopback IP.
const ATTACKER_HOST = `attacker.example:${SERVER_PORT}`;

/**
 * Statuses that count as "rejected before MCP dispatch".
 *
 * The CLI's guard returns 403 (consistent with the existing OriginValidationGuard
 * and the MCP TypeScript SDK's own check). 421 ("Misdirected Request") is the more
 * semantically specific code for a bad Host and is what the Python addon returns;
 * we accept either so the test asserts the security outcome, not the exact code.
 */
const REJECT_STATUSES = [403, 421];

interface McpResponse {
  status: number;
  body: unknown;
}

/** Build a JSON-RPC 2.0 request body. */
function mcpBody(
  method: string,
  params?: Record<string, unknown>,
  id = 1,
): string {
  const msg: Record<string, unknown> = { jsonrpc: "2.0", id, method };
  if (params !== undefined) {
    msg.params = params;
  }
  return JSON.stringify(msg);
}

/** Minimal MCP `initialize` params. */
function initializeParams(): Record<string, unknown> {
  return {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "dns-rebinding-test", version: "0.0.0" },
  };
}

/**
 * Parse a Streamable-HTTP response body (SSE `data:` frames or plain JSON).
 * Returns the first decoded JSON-RPC object, or null if nothing parseable.
 */
function parseSseOrJson(raw: string): unknown {
  if (!raw) {
    return null;
  }
  if (raw.includes("data:")) {
    const chunks = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim());
    for (const chunk of chunks) {
      try {
        return JSON.parse(chunk);
      } catch {
        // try next frame
      }
    }
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Send a raw MCP POST with explicit Host/Origin headers.
 *
 * Connects to the real loopback IP:port (TCP) but sends `hostHeader` as the HTTP
 * Host header — this simulates a DNS-rebound request whose Host points at an
 * attacker-controlled name while the socket lands on the local server.
 */
function postMcp(opts: {
  body: string;
  hostHeader: string;
  originHeader?: string;
}): Promise<McpResponse> {
  const { body, hostHeader, originHeader } = opts;
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: hostHeader,
      "Content-Type": "application/json",
      // Streamable HTTP requires the client to accept both.
      Accept: "application/json, text/event-stream",
      "Content-Length": Buffer.byteLength(body).toString(),
    };
    if (originHeader !== undefined) {
      headers.Origin = originHeader;
    }

    const req = http.request(
      {
        hostname: SERVER_HOST,
        port: SERVER_PORT,
        path: MCP_PATH,
        method: "POST",
        headers,
        timeout: 30000,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: parseSseOrJson(raw) }),
        );
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timed out")));
    req.write(body);
    req.end();
  });
}

describe("E2E: DNS-rebinding protection (HTTP transport)", () => {
  // Positive control: proves the endpoint actually serves `initialize` for a
  // legitimate local request. If this passes but the attacker case below also
  // gets 200, that 200 is the vulnerability — not a broken endpoint.
  it("positive control: loopback Host serves MCP initialize (200 + result)", async () => {
    const res = await postMcp({
      body: mcpBody("initialize", initializeParams(), 1),
      hostHeader: LOOPBACK_HOST,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: expect.anything() });
  });

  it("RED-UNTIL-FIX: initialize with an attacker Host is rejected", async () => {
    const res = await postMcp({
      body: mcpBody("initialize", initializeParams(), 2),
      hostHeader: ATTACKER_HOST,
    });
    expect(REJECT_STATUSES).toContain(res.status);
  });

  it("RED-UNTIL-FIX: tools/call with an attacker Host is rejected before dispatch", async () => {
    const res = await postMcp({
      body: mcpBody("tools/call", { name: "listDecks", arguments: {} }, 3),
      hostHeader: ATTACKER_HOST,
    });
    expect(REJECT_STATUSES).toContain(res.status);
  });

  it("regression: loopback Host with no Origin is still served (non-browser clients keep working)", async () => {
    const res = await postMcp({
      body: mcpBody("initialize", initializeParams(), 4),
      hostHeader: LOOPBACK_HOST,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: expect.anything() });
  });

  it("regression: loopback Host + loopback Origin is served (200)", async () => {
    const res = await postMcp({
      body: mcpBody("initialize", initializeParams(), 5),
      hostHeader: LOOPBACK_HOST,
      originHeader: `http://127.0.0.1:${SERVER_PORT}`,
    });
    expect(res.status).toBe(200);
  });

  it("already-mitigated: loopback Host + disallowed Origin is rejected (existing OriginValidationGuard)", async () => {
    // Documents the Origin half of the defense we already ship. Passes today.
    const res = await postMcp({
      body: mcpBody("initialize", initializeParams(), 6),
      hostHeader: LOOPBACK_HOST,
      originHeader: `http://attacker.example:${SERVER_PORT}`,
    });
    expect(REJECT_STATUSES).toContain(res.status);
  });
});
