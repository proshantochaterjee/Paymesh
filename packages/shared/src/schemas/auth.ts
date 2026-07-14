import { z } from "zod";

import { stellarAddressSchema } from "./primitives.js";

// docs/AUTHENTICATION.md §5: min 12 chars; the zxcvbn denylist check
// itself is a runtime service concern (backend), not expressible in Zod.
const passwordSchema = z.string().min(12, "Password must be at least 12 characters");

export const registerSchema = z.object({
  email: z.email(),
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const walletChallengeSchema = z.object({
  address: stellarAddressSchema,
});
export type WalletChallengeInput = z.infer<typeof walletChallengeSchema>;

export const walletVerifySchema = z.object({
  address: stellarAddressSchema,
  signedNonce: z.string().min(1),
});
export type WalletVerifyInput = z.infer<typeof walletVerifySchema>;
