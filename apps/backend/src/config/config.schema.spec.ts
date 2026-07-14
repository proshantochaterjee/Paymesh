import { describe, expect, it } from "vitest";

import { configSchema } from "./config.schema";

const validEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/workforceos",
  AUTH_JWT_SECRET: "a".repeat(32),
  STELLAR_FACTORY_CONTRACT_ADDRESS: "C" + "A".repeat(55),
  STELLAR_USDC_SAC_ADDRESS: "C" + "A".repeat(55),
  STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS: "C" + "A".repeat(55),
  STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS: "C" + "A".repeat(55),
  STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS: "C" + "A".repeat(55),
};

describe("configSchema", () => {
  it("accepts a valid environment and applies documented defaults", () => {
    const result = configSchema.parse(validEnv);
    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(3001);
    expect(result.STELLAR_NETWORK).toBe("testnet");
    expect(result.STELLAR_RPC_URL).toBe("https://soroban-testnet.stellar.org");
    expect(result.AUTH_SESSION_TTL_SECONDS).toBe(604800);
  });

  it("fails fast when a required var is missing", () => {
    const { DATABASE_URL: _omit, ...rest } = validEnv;
    expect(() => configSchema.parse(rest)).toThrow();
  });

  it("fails fast when AUTH_JWT_SECRET is too short", () => {
    expect(() => configSchema.parse({ ...validEnv, AUTH_JWT_SECRET: "short" })).toThrow();
  });

  it("rejects any Stellar network other than testnet (docs/BLOCKCHAIN_ARCHITECTURE.md §1)", () => {
    expect(() => configSchema.parse({ ...validEnv, STELLAR_NETWORK: "public" })).toThrow();
  });

  it("coerces numeric env strings", () => {
    const result = configSchema.parse({ ...validEnv, PORT: "4000" });
    expect(result.PORT).toBe(4000);
  });

  it("treats a blank REDIS_URL placeholder (as in .env.example) as unset, falling through to the local-dev default", () => {
    const result = configSchema.parse({ ...validEnv, REDIS_URL: "" });
    expect(result.REDIS_URL).toBe("redis://localhost:6379");
  });

  it("still rejects a genuinely malformed REDIS_URL", () => {
    expect(() => configSchema.parse({ ...validEnv, REDIS_URL: "not-a-url" })).toThrow();
  });

  it("defaults FRONTEND_ORIGINS to the local Next.js dev origin", () => {
    const result = configSchema.parse(validEnv);
    expect(result.FRONTEND_ORIGINS).toEqual(["http://localhost:3000"]);
  });

  it("splits a comma-separated FRONTEND_ORIGINS into a trimmed array", () => {
    const result = configSchema.parse({ ...validEnv, FRONTEND_ORIGINS: "http://localhost:3000, https://app.example.com" });
    expect(result.FRONTEND_ORIGINS).toEqual(["http://localhost:3000", "https://app.example.com"]);
  });
});
