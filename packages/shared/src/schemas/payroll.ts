import { z } from "zod";

import { PAYROLL_ITEM_STATUSES, PAYROLL_RUN_STATUSES } from "../constants/enums.js";
import { decimalAmountSchema, idSchema } from "./primitives.js";

export const createPayrollRunSchema = z.object({
  payPeriodStart: z.coerce.date(),
  payPeriodEnd: z.coerce.date(),
  employeeIds: z.array(idSchema).min(1),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const payrollItemSchema = z.object({
  id: idSchema,
  employeeId: idSchema,
  amount: decimalAmountSchema,
  status: z.enum(PAYROLL_ITEM_STATUSES),
  stellarTxHash: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
});
export type PayrollItem = z.infer<typeof payrollItemSchema>;

export const payrollRunSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  payPeriodStart: z.coerce.date(),
  payPeriodEnd: z.coerce.date(),
  status: z.enum(PAYROLL_RUN_STATUSES),
  totalAmount: decimalAmountSchema,
  items: z.array(payrollItemSchema).optional(),
});
export type PayrollRun = z.infer<typeof payrollRunSchema>;

/**
 * docs/PAYROLL_ENGINE.md §2: chunks execute sequentially, one at a time
 * (each needs its own wallet signature, so there's no other way to build
 * chunk N+1 before chunk N is submitted anyway) — `POST execute-intent`
 * returns the *next* unexecuted chunk only, not all chunks at once.
 */
export const executePayrollIntentResponseSchema = z.object({
  intentId: idSchema,
  unsignedXdr: z.string(),
  expiresAt: z.string(),
  chunkIndex: z.number().int(),
  totalChunks: z.number().int(),
  employeeIds: z.array(idSchema),
});
export type ExecutePayrollIntentResponse = z.infer<typeof executePayrollIntentResponseSchema>;

export const submitPayrollIntentResponseSchema = z.object({
  status: z.literal("submitted"),
  stellarTxHash: z.string(),
  isLastChunk: z.boolean(),
});
export type SubmitPayrollIntentResponse = z.infer<typeof submitPayrollIntentResponseSchema>;
