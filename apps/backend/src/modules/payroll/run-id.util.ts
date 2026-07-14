import { createHash } from "node:crypto";

/**
 * docs/PAYROLL_ENGINE.md §2: each chunk gets its own `run_id`, "derived as
 * `${payrollRun.id}-${chunkIndex}` hashed to a `u64`... not guessable/
 * sequential-from-zero-per-org that a malicious actor could race." SHA-256
 * over the input, first 8 bytes read as an unsigned big-endian u64 —
 * deterministic (so retrying an intent build for the same chunk always
 * targets the same on-chain `run_id`) and not derivable without knowing
 * the exact Postgres `PayrollRun.id`.
 */
export function deriveChunkRunId(payrollRunId: string, chunkIndex: number): bigint {
  const hash = createHash("sha256").update(`${payrollRunId}-${chunkIndex}`).digest();
  return hash.readBigUInt64BE(0);
}
