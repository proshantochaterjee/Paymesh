import { z } from "zod";

import { TRANSACTION_STATUSES, TRANSACTION_TYPES } from "../constants/enums.js";
import { decimalAmountSchema, idSchema, paginationQuerySchema } from "./primitives.js";

export const transactionQuerySchema = paginationQuerySchema.extend({
  type: z.enum(TRANSACTION_TYPES).optional(),
  status: z.enum(TRANSACTION_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export const transactionSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  type: z.enum(TRANSACTION_TYPES),
  status: z.enum(TRANSACTION_STATUSES),
  amount: decimalAmountSchema,
  asset: z.string(),
  fromAddress: z.string(),
  toAddress: z.string(),
  stellarTxHash: z.string(),
  ledgerSequence: z.string(),
  relatedEntityType: z.string().nullable().optional(),
  relatedEntityId: idSchema.nullable().optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;
