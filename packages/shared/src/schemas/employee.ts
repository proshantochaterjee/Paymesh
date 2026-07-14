import { z } from "zod";

import { PAY_FREQUENCIES, EMPLOYEE_STATUSES } from "../constants/enums.js";
import { decimalAmountSchema, idSchema, stellarAddressSchema } from "./primitives.js";

/**
 * Fields validated identically whether an employee is created through the
 * single-create API or a CSV import row (docs/EMPLOYEE_MODEL.md §3,
 * docs/CSV_IMPORT.md §2) — only department representation differs between
 * the two entry points (an existing department's ID vs. a free-text name
 * that's created on the fly), so it's factored out here rather than
 * duplicated between createEmployeeSchema and csvEmployeeRowSchema.
 */
export const employeeCoreFieldsSchema = z.object({
  fullName: z.string().min(1).max(255),
  email: z.email(),
  walletAddress: stellarAddressSchema,
  salaryAmount: decimalAmountSchema,
  payFrequency: z.enum(PAY_FREQUENCIES),
});

export const createEmployeeSchema = employeeCoreFieldsSchema.extend({
  departmentId: idSchema.optional(),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  salaryAmount: decimalAmountSchema.optional(),
  payFrequency: z.enum(PAY_FREQUENCIES).optional(),
  departmentId: idSchema.optional(),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

export const employeeSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  departmentId: idSchema.nullable(),
  onChainEmployeeId: z.string().nullable(),
  fullName: z.string(),
  email: z.email(),
  walletAddress: stellarAddressSchema,
  salaryAmount: decimalAmountSchema,
  salaryCurrency: z.string(),
  payFrequency: z.enum(PAY_FREQUENCIES),
  status: z.enum(EMPLOYEE_STATUSES),
});
export type Employee = z.infer<typeof employeeSchema>;

/**
 * docs/EMPLOYEE_MODEL.md §3's two-phase creation, confirmed shape for
 * Step 10: `POST /employees` (and, when salary/frequency change,
 * `PATCH /employees/:employeeId`) writes the Postgres row and builds the
 * on-chain register/update intent in one response, since registering is
 * not an optional follow-up action the way a treasury deposit is — every
 * employee creation needs it. `intentId`/`unsignedXdr`/`expiresAt` are
 * only present when there's a pending on-chain confirmation (e.g. a
 * department-only PATCH has none).
 */
export const employeeWithIntentSchema = z.object({
  employee: employeeSchema,
  intentId: idSchema.optional(),
  unsignedXdr: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type EmployeeWithIntent = z.infer<typeof employeeWithIntentSchema>;
