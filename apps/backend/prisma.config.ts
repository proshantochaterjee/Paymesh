import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "@prisma/config";

// Prisma 7's CLI does not auto-load .env before evaluating this file (the
// `env()` calls below run eagerly), unlike Prisma <=6 — load it explicitly.
loadEnv();

// Prisma 7 moved the connection URL out of schema.prisma's datasource
// block and into this file, used by the CLI (migrate/generate/studio).
// The NestJS runtime (src/prisma/prisma.service.ts) reads DATABASE_URL
// itself, via a driver adapter, for the same reason.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
  },
});
