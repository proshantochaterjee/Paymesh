import { z } from "zod";

import { CONTRACTOR_STATUSES } from "../constants/enums.js";
import { idSchema, stellarAddressSchema } from "./primitives.js";

export const createContractorSchema = z.object({
  fullName: z.string().min(1).max(255),
  email: z.email(),
  walletAddress: stellarAddressSchema,
});
export type CreateContractorInput = z.infer<typeof createContractorSchema>;

export const updateContractorSchema = z.object({
  fullName: z.string().min(1).max(255).optional(),
  email: z.email().optional(),
  walletAddress: stellarAddressSchema.optional(),
});
export type UpdateContractorInput = z.infer<typeof updateContractorSchema>;

export const contractorSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  fullName: z.string(),
  email: z.email(),
  walletAddress: stellarAddressSchema,
  status: z.enum(CONTRACTOR_STATUSES),
});
export type Contractor = z.infer<typeof contractorSchema>;
