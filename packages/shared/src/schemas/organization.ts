import { z } from "zod";

import { stellarContractAddressSchema, idSchema } from "./primitives.js";

export const createOrganizationSchema = z.object({
  name: z.string().min(1).max(255),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

export const organizationSchema = z.object({
  id: idSchema,
  name: z.string(),
  slug: z.string(),
  onChainOrgId: z.string(),
  organizationContractAddr: stellarContractAddressSchema,
  treasuryContractAddr: stellarContractAddressSchema,
});
export type Organization = z.infer<typeof organizationSchema>;
