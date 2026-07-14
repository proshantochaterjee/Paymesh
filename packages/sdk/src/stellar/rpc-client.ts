import { Horizon, rpc } from "@stellar/stellar-sdk";

/**
 * Single construction point for Soroban RPC / Horizon clients
 * (docs/TECHNICAL_ARCHITECTURE.md §6) — a future RPC provider change
 * touches only this file, not every module that needs a client.
 */
export function createRpcClient(rpcUrl: string): rpc.Server {
  return new rpc.Server(rpcUrl);
}

export function createHorizonClient(horizonUrl: string): Horizon.Server {
  return new Horizon.Server(horizonUrl);
}
