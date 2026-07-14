import { z } from "zod";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants/pagination.js";

/** Stellar account (`G...`) public key: 56-char base32, prefix `G`. */
export const stellarAddressSchema = z
  .string()
  .regex(/^G[A-Z2-7]{55}$/, "Must be a valid Stellar account address (G...)");

/** Soroban contract (`C...`) address: 56-char base32, prefix `C`. */
export const stellarContractAddressSchema = z
  .string()
  .regex(/^C[A-Z2-7]{55}$/, "Must be a valid Soroban contract address (C...)");

/**
 * Decimal amount as transmitted over JSON (docs/API_SPECIFICATION.md
 * examples, e.g. "12500.0000000") — a positive decimal string with at
 * most 7 fractional digits, matching `Decimal(20, 7)` in
 * docs/DATABASE_SCHEMA.md and USDC's 7-decimal SAC precision.
 */
export const decimalAmountSchema = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, "Must be a positive decimal with at most 7 decimal places")
  .refine((value) => Number(value) > 0, "Must be greater than zero");

/**
 * Same shape as `decimalAmountSchema` but allows zero — for reading back
 * a balance/total (e.g. a fresh treasury with no deposits yet), never for
 * validating a mutating request's input amount.
 */
export const nonNegativeDecimalSchema = z
  .string()
  .regex(/^\d+(\.\d{1,7})?$/, "Must be a non-negative decimal with at most 7 decimal places");

/** Opaque entity ID (Prisma `cuid()`); intentionally not format-strict. */
export const idSchema = z.string().min(1);

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number().int(),
      pageSize: z.number().int(),
      total: z.number().int(),
    }),
  });
}
