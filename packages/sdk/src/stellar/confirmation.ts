import { scValToNative } from "@stellar/stellar-sdk";

import { createRpcClient } from "./rpc-client.js";
import type { StellarNetworkConfig } from "./network.js";

/**
 * Unlike treasury (whose balance is always re-read fresh, so nothing ever
 * needs a transaction's *return value*), employee registration needs the
 * chain-generated `employee_id` back to backfill `Employee.onChainEmployeeId`
 * (docs/EMPLOYEE_MODEL.md §3: "on confirmation, the backend backfills
 * onChainEmployeeId") — that value only exists once the transaction is
 * actually applied in a closed ledger, a few seconds after `sendTransaction`
 * returns. Polls rather than blocking indefinitely; the Event Indexer
 * (Step 13) is the long-term source of truth for confirmation, this is a
 * short synchronous wait so Step 10 doesn't leave every registration
 * permanently "pending" until Step 13 exists.
 */
export async function waitForTransactionConfirmation(
  hash: string,
  config: StellarNetworkConfig,
  options?: { timeoutMs?: number; pollIntervalMs?: number },
): Promise<{ status: string; returnValue?: unknown }> {
  const server = createRpcClient(config.rpcUrl);
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1_500;
  const deadline = Date.now() + timeoutMs;

  let result = await server.getTransaction(hash);
  while (result.status === "NOT_FOUND" && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    result = await server.getTransaction(hash);
  }

  if (result.status === "SUCCESS") {
    return {
      status: result.status,
      returnValue: result.returnValue ? scValToNative(result.returnValue) : undefined,
    };
  }
  return { status: result.status };
}
