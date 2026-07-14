import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { Logger } from "nestjs-pino";

import { AppModule } from "./app.module";
import type { AppConfig } from "./config/config.schema";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService<AppConfig, true>);

  // Step 15's frontend runs on a different origin — `credentials: true`
  // is required for the session cookie (Better Auth) to flow on
  // client-side (browser) fetches from `lib/api/client.ts`; server-side
  // calls (`lib/api/server.ts`, Server Components) aren't subject to CORS
  // at all and need no change here.
  app.enableCors({
    origin: config.get("FRONTEND_ORIGINS", { infer: true }),
    credentials: true,
  });

  // docs/API_SPECIFICATION.md: "Base URL: /api/v1"; /health stays
  // unprefixed for platform health-check conventions (docs/DEVOPS.md §4).
  app.setGlobalPrefix("api/v1", { exclude: ["health"] });

  // docs/OPENAPI_SPEC.md: authoritative machine-readable spec generated at
  // build time from these same controller decorators, served at
  // `/api/docs` (Swagger UI) and `/api/docs-json` (raw spec) — unaffected
  // by the `/api/v1` global prefix above, since `SwaggerModule.setup`
  // mounts directly on the underlying HTTP adapter rather than through a
  // Nest controller.
  const swaggerConfig = new DocumentBuilder()
    .setTitle("WorkforceOS API")
    .setDescription("Off-chain organizational data and on-chain transaction orchestration for WorkforceOS. See docs/API_SPECIFICATION.md for full narrative documentation.")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(config.get("PORT", { infer: true }));
}

void bootstrap();
