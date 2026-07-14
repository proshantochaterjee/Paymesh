import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";

/**
 * docs/OPENAPI_SPEC.md: the generated document must stay a superset of
 * that checked-in reference skeleton. This doesn't diff against the full
 * skeleton (that's CI's job per docs/CI_CD.md, Step 19, not yet built) —
 * just proves the same `DocumentBuilder`/`SwaggerModule` setup `main.ts`
 * runs at boot produces a valid document covering every resource group
 * the skeleton documents, so a broken decorator doesn't silently ship.
 */
describe("OpenAPI document generation", () => {
  it("builds a valid OpenAPI document covering every documented resource group", async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const config = new DocumentBuilder().setTitle("WorkforceOS API").setVersion("1.0.0").addBearerAuth().build();
    const document = SwaggerModule.createDocument(app, config);

    const paths = Object.keys(document.paths);
    for (const resource of ["auth", "organizations", "treasury", "employees", "contractors", "payroll-runs", "milestones", "transactions", "analytics"]) {
      expect(paths.some((path) => path.includes(resource)), `expected a documented path for "${resource}"`).toBe(true);
    }
    expect(document.info.title).toBe("WorkforceOS API");

    await app.close();
  }, 30_000);
});
