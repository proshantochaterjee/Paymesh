import { z } from "zod";

// docs/BACKEND_ARCHITECTURE.md §7: fail fast on missing/invalid env vars
// rather than failing later on first use. Config groups: database, auth,
// stellar, redis (optional).
export const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),

  // database (Step 6 wires Prisma against this)
  DATABASE_URL: z.string().min(1),

  // auth (Step 7 wires Better Auth against these)
  AUTH_JWT_SECRET: z.string().min(32),
  AUTH_SESSION_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),

  // stellar (Steps 8/9 wire packages/sdk against these)
  // Testnet only for the MVP — no code path accepts "public"
  // (docs/BLOCKCHAIN_ARCHITECTURE.md §1).
  STELLAR_NETWORK: z.literal("testnet").default("testnet"),
  STELLAR_RPC_URL: z.string().url().default("https://soroban-testnet.stellar.org"),
  STELLAR_HORIZON_URL: z.string().url().default("https://horizon-testnet.stellar.org"),
  STELLAR_FACTORY_CONTRACT_ADDRESS: z.string().min(1),
  STELLAR_USDC_SAC_ADDRESS: z.string().min(1),
  // employee_registry/payroll_engine are network-wide singletons
  // (docs/BLOCKCHAIN_ARCHITECTURE.md §2), unlike treasury — one fixed
  // address, not looked up per-org.
  STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS: z.string().min(1),
  STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS: z.string().min(1),
  STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS: z.string().min(1),

  // CORS — Step 15's frontend runs on a different origin/port (Next.js
  // dev default `http://localhost:3000`), so browser fetches from
  // `lib/api/client.ts`'s client-side TanStack Query hooks need this
  // (server-side `lib/api/server.ts` calls aren't subject to CORS at all,
  // but client components' calls are). Comma-separated for multiple
  // allowed origins (e.g. a deployed frontend URL alongside local dev).
  FRONTEND_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),

  // redis — Step 13's Event Indexer runs its polling job as a BullMQ
  // repeatable job, so this is now load-bearing (not optional as
  // originally noted pre-Step-13). Defaults to the standard local dev
  // instance so existing envs without REDIS_URL set don't fail config
  // validation; a blank placeholder in .env (see .env.example) is still
  // treated as unset, not an invalid URL, falling through to the default.
  REDIS_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().default("redis://localhost:6379"),
  ),
});

export type AppConfig = z.infer<typeof configSchema>;
