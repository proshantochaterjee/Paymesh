import { Horizon, rpc } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { createHorizonClient, createRpcClient } from "./rpc-client.js";

describe("rpc-client", () => {
  it("creates a Soroban RPC server client", () => {
    const client = createRpcClient("https://soroban-testnet.stellar.org");
    expect(client).toBeInstanceOf(rpc.Server);
  });

  it("creates a Horizon server client", () => {
    const client = createHorizonClient("https://horizon-testnet.stellar.org");
    expect(client).toBeInstanceOf(Horizon.Server);
  });
});
