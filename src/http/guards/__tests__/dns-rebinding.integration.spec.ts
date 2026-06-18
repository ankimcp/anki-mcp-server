import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "../../../app.module";
import { buildConfigInput } from "../../../config";

/**
 * Integration tests for DNS-rebinding protection on the HTTP transport.
 *
 * Advisory: GHSA-j9xx-59ph-wmr6. Companion to the raw-socket e2e suite
 * (test/e2e/dns-rebinding.http.e2e-spec.ts) — this tier boots the real
 * `AppModule.forHttp()` in-process (no Docker, no Anki) and drives it with
 * supertest, so it runs under `npm test`.
 *
 * The attack: a DNS-rebound browser sends a same-origin request whose Host is an
 * attacker-controlled name (resolving to 127.0.0.1) with no Origin header. With
 * no Host validation the server happily completes MCP `initialize` and dispatches
 * tools.
 *
 * RED-UNTIL-FIX
 * -------------
 * The attacker-Host case is EXPECTED TO FAIL today: no Host guard runs, so the
 * request is served (200). It turns GREEN once the Host-validation guard is
 * registered.
 *
 * IMPORTANT — the fix must register the guard at the MODULE level (e.g. via an
 * `APP_GUARD` provider in `AppModule.forHttp()`), not only via
 * `app.useGlobalGuards(...)` in main-http.ts. `Test.createTestingModule` does not
 * run main-http.ts's bootstrap, so a bootstrap-only guard would leave this test
 * red forever. Module-level registration is the intended, testable design (and
 * lets the guard use DI for config).
 */
describe("DNS-rebinding protection (HTTP module integration)", () => {
  let app: INestApplication;

  const ATTACKER_HOST = "attacker.example:3000";

  const initializeBody = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "dns-rebinding-test", version: "0.0.0" },
    },
  };

  /** Statuses that count as "rejected before MCP dispatch" (see e2e spec). */
  const REJECT_STATUSES = [403, 421];

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule.forHttp(buildConfigInput())],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  it("positive control: a default (loopback) Host serves MCP initialize (200)", async () => {
    // supertest's default Host is the ephemeral loopback address, which the
    // allowlist must accept. This proves the endpoint serves initialize, so the
    // attacker case getting 200 below is the vulnerability — not a dead endpoint.
    const res = await request(app.getHttpServer())
      .post("/")
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send(initializeBody);

    expect(res.status).toBe(200);
  });

  it("RED-UNTIL-FIX: initialize with an attacker Host is rejected", async () => {
    const res = await request(app.getHttpServer())
      .post("/")
      .set("Host", ATTACKER_HOST)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send(initializeBody);

    expect(REJECT_STATUSES).toContain(res.status);
  });

  it("RED-UNTIL-FIX: tools/list with an attacker Host is rejected before dispatch", async () => {
    const res = await request(app.getHttpServer())
      .post("/")
      .set("Host", ATTACKER_HOST)
      .set("Content-Type", "application/json")
      .set("Accept", "application/json, text/event-stream")
      .send({ jsonrpc: "2.0", id: 2, method: "tools/list" });

    expect(REJECT_STATUSES).toContain(res.status);
  });
});
