// Mirrors packages/contracts/common/src/error.rs's WorkforceError enum
// byte-for-byte (docs/ERROR_HANDLING.md §4) — update both together.
//
// NotOrganization (7) is defined in the Rust registry but not currently
// returned by any contract function (docs/SMART_CONTRACT_SPECIFICATION.md
// §3 lists it as reserved for a caller-must-be-the-organization-contract
// check that no implemented function actually performs); mirrored here
// for completeness since the registry is meant to stay byte-for-byte
// identical on both sides.
export const CONTRACT_ERROR_CODES = {
  1: "NotFactoryAdmin",
  2: "OrgNotFound",
  3: "AlreadyInitialized",
  4: "NotAuthorized",
  5: "RoleNotFound",
  6: "CannotRevokeLastOwner",
  7: "NotOrganization",
  8: "NotAuthorizedSpender",
  9: "InsufficientBalance",
  10: "InvalidAmount",
  11: "EmployeeNotFound",
  12: "InvalidSalary",
  13: "RunAlreadyExecuted",
  14: "EmptyBatch",
  15: "MilestoneNotFound",
  16: "InvalidStateTransition",
} as const;

export type ContractErrorCode = keyof typeof CONTRACT_ERROR_CODES;
export type ContractErrorName = (typeof CONTRACT_ERROR_CODES)[ContractErrorCode];
