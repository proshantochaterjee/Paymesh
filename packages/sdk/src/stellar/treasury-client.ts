import { contract, rpc, TransactionBuilder } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";
import { assertSimulationSucceeded } from "./simulation.js";

/**
 * `treasury` is deployed dynamically per organization
 * (docs/BLOCKCHAIN_ARCHITECTURE.md §2-3), so there's no single fixed
 * address to codegen a static typed client against — `contract.Client`
 * fetches the contract's spec from the network at call time instead
 * (docs/TECHNICAL_ARCHITECTURE.md §6). Its methods are attached
 * dynamically per the fetched spec, so TypeScript can't see them
 * statically; this local interface describes just the three functions
 * this module calls, verified against the real deployed contract
 * (packages/contracts/treasury/src/lib.rs).
 */
interface TreasuryContractClient {
  deposit(
    args: { from: string; amount: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  withdraw(
    args: { caller: string; to: string; amount: bigint },
    opts?: { publicKey?: string },
  ): Promise<contract.AssembledTransaction<null>>;
  get_balance(opts?: { publicKey?: string }): Promise<contract.AssembledTransaction<bigint>>;
}

async function treasuryClient(
  treasuryContractId: string,
  config: StellarNetworkConfig,
): Promise<TreasuryContractClient> {
  const client = await contract.Client.from({
    contractId: treasuryContractId,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  return client as unknown as TreasuryContractClient;
}

/**
 * docs/BLOCKCHAIN_ARCHITECTURE.md §5 "Build" step: simulates the call via
 * RPC (for accurate resource fees) and assembles the transaction —
 * returns unsigned XDR for the wallet to sign client-side. Never signs or
 * submits.
 */
export async function buildTreasuryDepositTransaction(params: {
  treasuryContractId: string;
  fromAddress: string;
  amountStroops: bigint;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await treasuryClient(params.treasuryContractId, params.config);
  const assembled = await client.deposit(
    { from: params.fromAddress, amount: params.amountStroops },
    { publicKey: params.fromAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

export async function buildTreasuryWithdrawTransaction(params: {
  treasuryContractId: string;
  callerAddress: string;
  toAddress: string;
  amountStroops: bigint;
  config: StellarNetworkConfig;
}): Promise<{ unsignedXdr: string }> {
  const client = await treasuryClient(params.treasuryContractId, params.config);
  const assembled = await client.withdraw(
    { caller: params.callerAddress, to: params.toAddress, amount: params.amountStroops },
    { publicKey: params.callerAddress },
  );
  assertSimulationSucceeded(assembled);
  return { unsignedXdr: assembled.toXDR() };
}

/** docs/TREASURY_ARCHITECTURE.md §2: live balance, never a cached Postgres column. */
export async function getTreasuryBalance(treasuryContractId: string, config: StellarNetworkConfig): Promise<bigint> {
  const client = await treasuryClient(treasuryContractId, config);
  const assembled = await client.get_balance();
  return assembled.result;
}

/**
 * docs/BACKEND_ARCHITECTURE.md §5 "submitIntent": submits an
 * already-signed transaction and returns immediately without blocking on
 * final confirmation — confirmation is the Event Indexer's job (Step 13).
 */
export async function submitSignedTransaction(
  signedXdr: string,
  config: StellarNetworkConfig,
): Promise<{ stellarTxHash: string; status: string }> {
  const server = new rpc.Server(config.rpcUrl);
  const tx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
  const result = await server.sendTransaction(tx);
  if (result.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${JSON.stringify(result.errorResult)}`);
  }
  return { stellarTxHash: result.hash, status: result.status };
}
