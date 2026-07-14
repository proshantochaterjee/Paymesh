import { rpc } from "@stellar/stellar-sdk";
import type { contract } from "@stellar/stellar-sdk";

/**
 * Thrown when `AssembledTransaction.build()`'s simulation itself fails
 * (e.g. a missing trustline, insufficient balance, unauthorized caller) —
 * `.toXDR()` still returns *something* in that case, but submitting it is
 * guaranteed to fail (the network rejects it as malformed, since a failed
 * simulation never populates the transaction's resource footprint), so
 * this is caught and surfaced immediately at build time instead of
 * silently handing the caller a doomed-to-fail unsigned XDR to sign.
 * Discovered building `treasury-client.ts` (a real withdrawal to an
 * account with no trustline failed with a generic `txMalformed` instead
 * of a clear error) — shared here since every contract-client builder in
 * this package needs the same check.
 */
export class SimulationFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SimulationFailedError";
  }
}

export function assertSimulationSucceeded(assembled: contract.AssembledTransaction<unknown>): void {
  const sim = assembled.simulation;
  if (sim && rpc.Api.isSimulationError(sim)) {
    throw new SimulationFailedError(sim.error);
  }
}
