// Mirrors packages/contracts/common/src/events.rs's `#[contractevent]`
// structs exactly — each event's leading topic is its containing struct's
// name in lower snake case (docs/EVENT_INDEXING.md), verified against a
// real emitted `org_created` event on Testnet before writing the indexer
// (see docs/DEVELOPMENT_PLAN.md's Step 13 entry). Update both together.

export const CONTRACT_EVENT_TOPICS = {
  ORG_CREATED: "org_created",
  WASM_HASH_UPDATED: "wasm_hash_updated",

  ROLE_GRANTED: "role_granted",
  ROLE_REVOKED: "role_revoked",
  ENGINE_UPDATED: "engine_updated",
  METADATA_UPDATED: "metadata_updated",

  DEPOSITED: "deposited",
  WITHDRAWN: "withdrawn",
  TRANSFERRED_OUT: "transferred_out",

  EMPLOYEE_REGISTERED: "employee_registered",
  EMPLOYEE_UPDATED: "employee_updated",
  EMPLOYEE_DEACTIVATED: "employee_deactivated",

  PAYROLL_RUN_STARTED: "payroll_run_started",
  PAYROLL_ITEM_PAID: "payroll_item_paid",
  PAYROLL_ITEM_FAILED: "payroll_item_failed",
  PAYROLL_RUN_COMPLETED: "payroll_run_completed",

  MILESTONE_CREATED: "milestone_created",
  MILESTONE_FUNDED: "milestone_funded",
  MILESTONE_APPROVED: "milestone_approved",
  MILESTONE_RELEASED: "milestone_released",
  MILESTONE_CANCELLED: "milestone_cancelled",
} as const;

export type ContractEventTopic = (typeof CONTRACT_EVENT_TOPICS)[keyof typeof CONTRACT_EVENT_TOPICS];

/** `treasury::transfer_out`'s `reason` topic — the literal `Symbol` values its two callers pass (payroll-engine, milestone-engine). */
export const TRANSFER_OUT_REASON = {
  PAYROLL: "payroll",
  MILESTONE_FUND: "milestone_fund",
} as const;
