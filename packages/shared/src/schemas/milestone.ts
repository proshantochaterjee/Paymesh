import { z } from "zod";

import { MILESTONE_STATUSES } from "../constants/enums.js";
import { decimalAmountSchema, idSchema } from "./primitives.js";

export const createMilestoneSchema = z.object({
  contractorId: idSchema,
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  amount: decimalAmountSchema,
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const milestoneSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  contractorId: idSchema,
  onChainMilestoneId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable().optional(),
  amount: decimalAmountSchema,
  status: z.enum(MILESTONE_STATUSES),
  stellarTxHash: z.string().nullable().optional(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

/**
 * docs/MILESTONE_ENGINE.md §3: funding a milestone is two on-chain calls
 * (`create_milestone` then `fund_milestone`) that can never be combined
 * into one transaction — Soroban rejects more than one
 * `InvokeHostFunction` operation per transaction (confirmed in Step 10
 * for CSV import's batch registration; the same constraint applies here).
 * `POST fund-intent` therefore returns one step at a time; `step`
 * disambiguates which on-chain call this particular XDR is for, so the
 * caller knows to call `fund-intent` again after submitting a `"create"`
 * step to get the `"fund"` step.
 */
export const fundMilestoneIntentResponseSchema = z.object({
  intentId: idSchema,
  unsignedXdr: z.string(),
  expiresAt: z.string(),
  step: z.enum(["create", "fund"]),
});
export type FundMilestoneIntentResponse = z.infer<typeof fundMilestoneIntentResponseSchema>;

/**
 * docs/MILESTONE_ENGINE.md §2: cancel is on-chain (state-changing, needs
 * a signature) whenever the milestone was ever `create_milestone`'d
 * on-chain — but purely Postgres when it wasn't (nothing exists on-chain
 * yet to cancel), same "optional intent fields" pattern as Employees'
 * deactivate endpoint.
 */
export const cancelMilestoneResponseSchema = z.object({
  milestone: milestoneSchema,
  intentId: idSchema.optional(),
  unsignedXdr: z.string().optional(),
  expiresAt: z.string().optional(),
});
export type CancelMilestoneResponse = z.infer<typeof cancelMilestoneResponseSchema>;
