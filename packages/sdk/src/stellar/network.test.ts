import { Networks } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { DEFAULT_STELLAR_HORIZON_URL, DEFAULT_STELLAR_RPC_URL, stellarNetworkConfig } from "./network.js";

describe("stellarNetworkConfig", () => {
  it("defaults to Testnet (docs/BLOCKCHAIN_ARCHITECTURE.md §1: no mainnet path)", () => {
    const config = stellarNetworkConfig();

    expect(config.networkPassphrase).toBe(Networks.TESTNET);
    expect(config.rpcUrl).toBe(DEFAULT_STELLAR_RPC_URL);
    expect(config.horizonUrl).toBe(DEFAULT_STELLAR_HORIZON_URL);
  });

  it("lets a caller override individual fields (e.g. backend's env-sourced URLs)", () => {
    const config = stellarNetworkConfig({ rpcUrl: "https://custom-rpc.example" });

    expect(config.rpcUrl).toBe("https://custom-rpc.example");
    expect(config.horizonUrl).toBe(DEFAULT_STELLAR_HORIZON_URL);
  });
});
