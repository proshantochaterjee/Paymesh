import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Logger } from "nestjs-pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";

// Full app boot proves every module in the skeleton wires together
// without a DI error — the thing actually at stake in a "module
// structure, no business logic yet" step (docs/DEVELOPMENT_PLAN.md Step 5).
// Required env vars come from vitest.config.ts's `setupFiles`
// (./test/setup-env.ts) — Stellar values are dummy since packages/sdk
// doesn't exist yet, but DATABASE_URL points at a real reachable Postgres
// (matching docs/CI_CD.md's backend-tests job) since /health now checks
// DB connectivity (Step 6). Module imports are hoisted ahead of any
// in-file beforeAll, so env vars can't be set in this file directly.
describe("AppModule (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix("api/v1", { exclude: ["health"] });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("boots with every domain module wired", () => {
    expect(app).toBeDefined();
  });

  it("GET /health returns ok with a real DB connectivity check, unprefixed", async () => {
    const response = await request(app.getHttpServer()).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", db: "ok" });
  });

  it("GET /api/v1/health does not exist (health is excluded from the API prefix)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/health");
    expect(response.status).toBe(404);
  });
});
