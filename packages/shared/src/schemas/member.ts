import { z } from "zod";

import { ORG_ROLES } from "../constants/roles.js";
import { idSchema } from "./primitives.js";

export const orgRoleSchema = z.enum(ORG_ROLES);

export const addMemberSchema = z.object({
  email: z.email(),
  role: orgRoleSchema,
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export const updateMemberRoleSchema = z.object({
  role: orgRoleSchema,
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const organizationMemberSchema = z.object({
  id: idSchema,
  organizationId: idSchema,
  userId: idSchema,
  role: orgRoleSchema,
  // OrganizationsRepository.findMembers/findMemberById always `include`
  // this (apps/backend/.../infra/organizations.repository.ts) — the type
  // previously omitted it, so the frontend had no way to render anything
  // but the raw internal userId in the Team Members table.
  user: z.object({
    id: idSchema,
    email: z.email(),
    name: z.string().nullable(),
    primaryWallet: z.string().nullable(),
  }),
});
export type OrganizationMember = z.infer<typeof organizationMemberSchema>;
