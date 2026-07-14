import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AppConfigModule } from "../config/config.module";
import { PrismaModule } from "./prisma.module";
import { PrismaService } from "./prisma.service";

// Real connectivity (onModuleInit's $connect) is exercised by the
// Testcontainers integration test — this just proves DI wiring constructs
// the service (and its driver adapter) correctly from config. Deliberately
// avoids `instanceof`/`toBeInstanceOf`/logging the instance: the generated
// PrismaClient is a Proxy under the hood, and Vite's module graph gives
// this test file's `PrismaService` import a different identity than the
// one Nest's compiled DI container resolves against, so `instanceof`
// returns false and any attempt to pretty-print the mismatch (including
// Vitest's own assertion-failure diff) recurses into the Proxy and blows
// the call stack. Duck-typing the expected shape sidesteps both problems.
describe("PrismaService", () => {
  it("is constructed via DI with a DATABASE_URL-derived adapter", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
    }).compile();

    const service = moduleRef.get(PrismaService);
    expect(typeof service.onModuleInit).toBe("function");
    expect(typeof service.onModuleDestroy).toBe("function");
    expect(typeof service.$connect).toBe("function");
  });
});
