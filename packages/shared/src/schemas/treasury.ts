import { z } from "zod";

import { decimalAmountSchema, nonNegativeDecimalSchema, stellarAddressSchema } from "./primitives.js";

export const depositIntentSchema = z.object({
  fromAddress: stellarAddressSchema,
  amount: decimalAmountSchema,
});
export type DepositIntentInput = z.infer<typeof depositIntentSchema>;

export const withdrawIntentSchema = z.object({
  callerAddress: stellarAddressSchema,
  toAddress: stellarAddressSchema,
  amount: decimalAmountSchema,
});
export type WithdrawIntentInput = z.infer<typeof withdrawIntentSchema>;

export const submitIntentSchema = z.object({
  signedXdr: z.string().min(1),
});
export type SubmitIntentInput = z.infer<typeof submitIntentSchema>;

/** docs/TREASURY_ARCHITECTURE.md §2-3: live balance + off-chain pending-obligations projection. */
export const treasuryOverviewSchema = z.object({
  balance: nonNegativeDecimalSchema,
  pendingObligations: nonNegativeDecimalSchema,
});
export type TreasuryOverview = z.infer<typeof treasuryOverviewSchema>;
