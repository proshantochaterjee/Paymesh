// Mirrors the enums in apps/backend/prisma/schema.prisma exactly
// (docs/DATABASE_SCHEMA.md). Update both together.

export const EMPLOYEE_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const CONTRACTOR_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type ContractorStatus = (typeof CONTRACTOR_STATUSES)[number];

export const PAY_FREQUENCIES = ["WEEKLY", "BI_WEEKLY", "MONTHLY"] as const;
export type PayFrequency = (typeof PAY_FREQUENCIES)[number];

export const PAYROLL_RUN_STATUSES = [
  "DRAFT",
  "SCHEDULED",
  "EXECUTING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYROLL_ITEM_STATUSES = ["PENDING", "PAID", "FAILED"] as const;
export type PayrollItemStatus = (typeof PAYROLL_ITEM_STATUSES)[number];

export const MILESTONE_STATUSES = [
  "DRAFT",
  "FUNDED",
  "APPROVED",
  "RELEASED",
  "CANCELLED",
] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const TRANSACTION_TYPES = [
  "DEPOSIT",
  "WITHDRAWAL",
  "PAYROLL_DISBURSEMENT",
  "MILESTONE_FUND",
  "MILESTONE_RELEASE",
  "MILESTONE_REFUND",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = ["SUBMITTED", "CONFIRMED", "FAILED"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

export const INTENT_TYPES = [
  "ORGANIZATION_CREATE",
  "ORGANIZATION_GRANT_ROLE",
  "ORGANIZATION_REVOKE_ROLE",
  "TREASURY_DEPOSIT",
  "TREASURY_WITHDRAW",
  "EMPLOYEE_REGISTER",
  "EMPLOYEE_UPDATE",
  "EMPLOYEE_DEACTIVATE",
  "PAYROLL_EXECUTE",
  "MILESTONE_CREATE",
  "MILESTONE_FUND",
  "MILESTONE_APPROVE",
  "MILESTONE_RELEASE",
  "MILESTONE_CANCEL",
] as const;
export type IntentType = (typeof INTENT_TYPES)[number];
