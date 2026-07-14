import { rpc, scValToNative } from "@stellar/stellar-sdk";

import type { StellarNetworkConfig } from "./network.js";

export interface DecodedContractEvent {
  id: string;
  ledger: number;
  txHash: string;
  topic: unknown[];
  value: unknown;
}

export async function getLatestLedgerSequence(config: StellarNetworkConfig): Promise<number> {
  const server = new rpc.Server(config.rpcUrl);
  const latest = await server.getLatestLedger();
  return latest.sequence;
}

/**
 * Fetches every event for one contract from `startLedger` onward,
 * paginating via the RPC's own cursor until exhausted
 * (docs/EVENT_INDEXING.md §3: "processes all returned events in ledger
 * order"). Soroban RPC only retains a limited retention window —
 * `startLedger` older than that is rejected by the RPC itself; callers
 * track their own `IndexerCursor` and never fall behind it.
 */
export async function getContractEvents(
  contractId: string,
  startLedger: number,
  config: StellarNetworkConfig,
): Promise<DecodedContractEvent[]> {
  const server = new rpc.Server(config.rpcUrl);
  const events: DecodedContractEvent[] = [];
  const limit = 1000;
  let cursor: string | undefined;

  // First page uses ledger-range mode (`startLedger`); subsequent pages
  // switch to cursor mode — the RPC's request type forbids mixing both in
  // one call (`Api.GetEventsRequest`).
  for (;;) {
    const response = cursor
      ? await server.getEvents({ filters: [{ type: "contract", contractIds: [contractId] }], cursor, limit })
      : await server.getEvents({ filters: [{ type: "contract", contractIds: [contractId] }], startLedger, limit });

    for (const event of response.events) {
      events.push({
        id: event.id,
        ledger: event.ledger,
        txHash: event.txHash,
        topic: event.topic.map((t) => scValToNative(t)),
        value: scValToNative(event.value),
      });
    }

    if (response.events.length < limit) break;
    cursor = response.cursor;
  }

  return events;
}
