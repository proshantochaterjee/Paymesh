import { randomBytes } from "node:crypto";

import { Injectable } from "@nestjs/common";
import type { Organization, OrgRole } from "@prisma/client";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentRepository } from "../../common/intent/intent.repository";
import { IntentService } from "../../common/intent/intent.service";
import { OrganizationsChainAdapter } from "./infra/organizations-chain.adapter";
import { MemberWithUser, OrganizationsRepository } from "./infra/organizations.repository";

export interface IntentResult {
  intentId: string;
  unsignedXdr: string;
  expiresAt: Date;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly chainAdapter: OrganizationsChainAdapter,
    private readonly intents: IntentService,
    private readonly intentRepository: IntentRepository,
  ) {}

  private async requireOrganization(organizationId: string): Promise<Organization> {
    const organization = await this.repository.findById(organizationId);
    if (!organization) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }
    return organization;
  }

  async list(userId: string): Promise<Organization[]> {
    return this.repository.findManyForUser(userId);
  }

  async getById(organizationId: string): Promise<Organization> {
    return this.requireOrganization(organizationId);
  }

  async updateName(organizationId: string, name: string): Promise<Organization> {
    await this.requireOrganization(organizationId);
    return this.repository.updateName(organizationId, name);
  }

  /**
   * docs/API_SPECIFICATION.md's `POST /organizations` calls
   * `create_organization` "then persists Organization row once
   * confirmed" as a single logical step — but `owner.require_auth()`
   * means only the caller's own wallet can authorize this call, so
   * (like every other on-chain mutation here) it must be a build/submit
   * pair, not one synchronous request. `name`/`slug`/`salt` ride along in
   * the Intent's metadata since there's no Organization row yet to store
   * them on.
   */
  async buildCreateIntent(userId: string, callerAddress: string, name: string): Promise<IntentResult> {
    const slug = slugify(name);
    if (await this.repository.slugExists(slug)) {
      throw new DomainException("SLUG_TAKEN", "An organization with this name already exists.");
    }

    const salt = randomBytes(32);
    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildCreateOrganizationXdr({ ownerAddress: callerAddress, salt }),
    );

    return this.intents.create({
      organizationId: null,
      type: "ORGANIZATION_CREATE",
      unsignedXdr,
      createdById: userId,
      metadata: { name, slug, salt: salt.toString("hex") },
    });
  }

  /**
   * Note: a second organization could theoretically claim the same slug
   * between build and submit — not handled here (rare, and the unique
   * constraint on `slug` at least prevents two rows from actually
   * colliding; the loser gets a Prisma error surfaced as a 500, not a
   * clean `SLUG_TAKEN`). Same class of known gap as Employees'
   * pending-registration reconciliation.
   */
  async submitCreateIntent(userId: string, intentId: string, signedXdr: string): Promise<Organization> {
    const intentRow = await this.intentRepository.findById(intentId);
    if (!intentRow || intentRow.organizationId !== null || intentRow.type !== "ORGANIZATION_CREATE") {
      throw new DomainException("INTENT_EXPIRED", "This intent does not exist or has expired.");
    }
    const metadata = intentRow.metadata as { name: string; slug: string };

    const { stellarTxHash } = await this.intents.submitAndConsume({
      intentId,
      organizationId: null,
      expectedType: "ORGANIZATION_CREATE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });

    const onChainOrgId = await this.chainAdapter.waitForConfirmedOrgId(stellarTxHash);
    if (onChainOrgId === null) {
      throw new DomainException("CHAIN_SUBMISSION_FAILED", "Organization creation did not confirm on-chain.");
    }
    const record = await this.chainAdapter.getOrganizationRecord(onChainOrgId);

    return this.repository.createConfirmed({
      name: metadata.name,
      slug: metadata.slug,
      onChainOrgId,
      organizationContractAddr: record.organization,
      treasuryContractAddr: record.treasury,
      ownerUserId: userId,
    });
  }

  async listMembers(organizationId: string): Promise<MemberWithUser[]> {
    return this.repository.findMembers(organizationId);
  }

  private async buildGrantRoleIntent(
    organizationId: string,
    createdById: string,
    callerAddress: string,
    targetUserId: string,
    targetWallet: string,
    role: OrgRole,
  ): Promise<IntentResult> {
    const organization = await this.requireOrganization(organizationId);
    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildGrantRoleXdr({
        organizationContractAddr: organization.organizationContractAddr,
        callerAddress,
        memberAddress: targetWallet,
        role,
      }),
    );

    return this.intents.create({
      organizationId,
      type: "ORGANIZATION_GRANT_ROLE",
      unsignedXdr,
      createdById,
      metadata: { targetUserId, role },
    });
  }

  async buildAddMemberIntent(
    organizationId: string,
    createdById: string,
    callerAddress: string,
    email: string,
    role: OrgRole,
  ): Promise<IntentResult> {
    const targetUser = await this.repository.findUserByEmail(email);
    if (!targetUser) {
      throw new DomainException("USER_NOT_FOUND", "No user is registered with this email.");
    }
    const existingMembership = await this.repository.findMembershipByUserId(organizationId, targetUser.id);
    if (existingMembership) {
      throw new DomainException("VALIDATION_ERROR", "This user is already a member of this organization.");
    }
    if (!targetUser.primaryWallet) {
      throw new DomainException("VALIDATION_ERROR", "This user must link a Stellar wallet before being granted a role.");
    }

    return this.buildGrantRoleIntent(organizationId, createdById, callerAddress, targetUser.id, targetUser.primaryWallet, role);
  }

  async buildUpdateMemberRoleIntent(
    organizationId: string,
    createdById: string,
    callerAddress: string,
    memberId: string,
    role: OrgRole,
  ): Promise<IntentResult> {
    const member = await this.repository.findMemberById(organizationId, memberId);
    if (!member) {
      throw new DomainException("MEMBER_NOT_FOUND", "No such member.");
    }
    if (!member.user.primaryWallet) {
      throw new DomainException("VALIDATION_ERROR", "This user must link a Stellar wallet before being granted a role.");
    }
    if (member.role === "OWNER" && role !== "OWNER" && (await this.repository.countOwners(organizationId)) <= 1) {
      throw new DomainException("INVALID_STATE_TRANSITION", "Cannot demote the last remaining owner.");
    }

    return this.buildGrantRoleIntent(organizationId, createdById, callerAddress, member.userId, member.user.primaryWallet, role);
  }

  /** Shared by both "add member" and "change role" submit endpoints — both build the same `ORGANIZATION_GRANT_ROLE` intent type. */
  async submitGrantRoleIntent(organizationId: string, intentId: string, signedXdr: string): Promise<MemberWithUser> {
    const intentRow = await this.intentRepository.findById(intentId);
    if (!intentRow || intentRow.organizationId !== organizationId || intentRow.type !== "ORGANIZATION_GRANT_ROLE") {
      throw new DomainException("INTENT_EXPIRED", "This intent does not exist or has expired.");
    }
    const metadata = intentRow.metadata as { targetUserId: string; role: OrgRole };

    const { stellarTxHash } = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "ORGANIZATION_GRANT_ROLE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });

    const confirmed = await this.chainAdapter.waitForConfirmedSuccess(stellarTxHash);
    if (!confirmed) {
      throw new DomainException("CHAIN_SUBMISSION_FAILED", "Role grant did not confirm on-chain.");
    }

    return this.repository.upsertMember(organizationId, metadata.targetUserId, metadata.role);
  }

  async buildRemoveMemberIntent(
    organizationId: string,
    createdById: string,
    callerAddress: string,
    memberId: string,
  ): Promise<IntentResult> {
    const organization = await this.requireOrganization(organizationId);
    const member = await this.repository.findMemberById(organizationId, memberId);
    if (!member) {
      throw new DomainException("MEMBER_NOT_FOUND", "No such member.");
    }
    if (!member.user.primaryWallet) {
      throw new DomainException("VALIDATION_ERROR", "This user has no linked wallet on record for this on-chain action.");
    }
    if (member.role === "OWNER" && (await this.repository.countOwners(organizationId)) <= 1) {
      throw new DomainException("INVALID_STATE_TRANSITION", "Cannot remove the last remaining owner.");
    }

    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildRevokeRoleXdr({
        organizationContractAddr: organization.organizationContractAddr,
        callerAddress,
        memberAddress: member.user.primaryWallet!,
      }),
    );

    return this.intents.create({
      organizationId,
      type: "ORGANIZATION_REVOKE_ROLE",
      unsignedXdr,
      createdById,
      metadata: { memberId },
    });
  }

  async submitRemoveMemberIntent(organizationId: string, intentId: string, signedXdr: string): Promise<{ status: "removed" }> {
    const intentRow = await this.intentRepository.findById(intentId);
    if (!intentRow || intentRow.organizationId !== organizationId || intentRow.type !== "ORGANIZATION_REVOKE_ROLE") {
      throw new DomainException("INTENT_EXPIRED", "This intent does not exist or has expired.");
    }
    const metadata = intentRow.metadata as { memberId: string };

    const { stellarTxHash } = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "ORGANIZATION_REVOKE_ROLE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });

    const confirmed = await this.chainAdapter.waitForConfirmedSuccess(stellarTxHash);
    if (!confirmed) {
      throw new DomainException("CHAIN_SUBMISSION_FAILED", "Role revocation did not confirm on-chain.");
    }

    await this.repository.deleteMember(metadata.memberId);
    return { status: "removed" };
  }
}
