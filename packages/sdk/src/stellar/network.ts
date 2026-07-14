import { Networks } from "@stellar/stellar-sdk";

/**
 * docs/BLOCKCHAIN_ARCHITECTURE.md §1: Testnet exclusively for the MVP — no
 * code path accepts "public" until a post-MVP security audit is scoped.
 */
export const STELLAR_NETWORK_PASSPHRASE = Networks.TESTNET;

export const DEFAULT_STELLAR_RPC_URL = "https://soroban-testnet.stellar.org";
export const DEFAULT_STELLAR_HORIZON_URL = "https://horizon-testnet.stellar.org";

export interface StellarNetworkConfig {
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
}

/**
 * Callers (backend, frontend) supply their own env-sourced URLs — the SDK
 * stays agnostic of where config comes from (docs/BACKEND_ARCHITECTURE.md
 * §4: only the boundary that talks to Stellar lives here, not config
 * plumbing).
 */
export function stellarNetworkConfig(overrides?: Partial<StellarNetworkConfig>): StellarNetworkConfig {
  return {
    rpcUrl: overrides?.rpcUrl ?? DEFAULT_STELLAR_RPC_URL,
    horizonUrl: overrides?.horizonUrl ?? DEFAULT_STELLAR_HORIZON_URL,
    networkPassphrase: overrides?.networkPassphrase ?? STELLAR_NETWORK_PASSPHRASE,
  };
}
