// docs/API_SPECIFICATION.md "Every 'intent' endpoint follows the same shape"
export const INTENT_EXPIRY_MINUTES = 5;

// docs/PAYROLL_ENGINE.md §2 — benchmarked against the real deployed
// contracts in Step 11 (real submission, not simulation alone: see that
// doc's methodology note). Confirmed ceiling was 10 employees in one
// run_payroll transaction; this is 2 below that as safety margin.
export const PAYROLL_CHUNK_SIZE = 8;
