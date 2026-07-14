import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { OrganizationsService } from "./organizations.service";

// IntentService's own generic lifecycle is tested in
// common/intent/intent.service.spec.ts — here it's real (backed by a
// mocked IntentRepository), so these tests focus on what's
// organizations-specific: the nullable-organizationId path org creation
// needs, member-resolution branching, and the last-owner protections.
function createMocks() {
  const repository = {
    slugExists: vi.fn(),
    findManyForUser: vi.fn(),
    findById: vi.fn(),
    updateName: vi.fn(),
    createConfirmed: vi.fn(),
    findMembers: vi.fn(),
    findMemberById: vi.fn(),
    findMembershipByUserId: vi.fn(),
    findUserByEmail: vi.fn(),
    countOwners: vi.fn(),
    upsertMember: vi.fn(),
    deleteMember: vi.fn(),
  };
  const chainAdapter = {
    buildCreateOrganizationXdr: vi.fn(),
    buildGrantRoleXdr: vi.fn(),
    buildRevokeRoleXdr: vi.fn(),
    submitSignedXdr: vi.fn(),
    waitForConfirmedOrgId: vi.fn(),
    waitForConfirmedSuccess: vi.fn(),
    getOrganizationRecord: vi.fn(),
  };
  const intentRepository = { create: vi.fn(), findById: vi.fn(), markConsumed: vi.fn() };
  const intents = new IntentService(intentRepository as never);
  const service = new OrganizationsService(repository as never, chainAdapter as never, intents, intentRepository as never);
  return { service, repository, chainAdapter, intentRepository };
}

describe("OrganizationsService", () => {
  describe("buildCreateIntent", () => {
    it("throws SLUG_TAKEN when the derived slug already exists", async () => {
      const { service, repository } = createMocks();
      repository.slugExists.mockResolvedValue(true);

      await expect(service.buildCreateIntent("user1", "GOWNER", "Acme DAO")).rejects.toMatchObject({
        code: "SLUG_TAKEN",
      } satisfies Partial<DomainException>);
    });

    it("builds an ORGANIZATION_CREATE intent with no organizationId (none exists yet)", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.slugExists.mockResolvedValue(false);
      chainAdapter.buildCreateOrganizationXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.buildCreateIntent("user1", "GOWNER", "Acme DAO");

      expect(chainAdapter.buildCreateOrganizationXdr).toHaveBeenCalledWith(
        expect.objectContaining({ ownerAddress: "GOWNER" }),
      );
      expect(intentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: null,
          type: "ORGANIZATION_CREATE",
          metadata: expect.objectContaining({ name: "Acme DAO", slug: "acme-dao" }),
        }),
      );
      expect(result.intentId).toBe("intent1");
    });
  });

  describe("submitCreateIntent", () => {
    it("throws INTENT_EXPIRED when the intent row is missing", async () => {
      const { service, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue(null);

      await expect(service.submitCreateIntent("user1", "intent1", "SIGNED")).rejects.toMatchObject({
        code: "INTENT_EXPIRED",
      } satisfies Partial<DomainException>);
    });

    it("persists the Organization + OWNER membership once confirmed on-chain", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: null,
        type: "ORGANIZATION_CREATE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { name: "Acme DAO", slug: "acme-dao" },
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "TX1", status: "PENDING" });
      chainAdapter.waitForConfirmedOrgId.mockResolvedValue(7n);
      chainAdapter.getOrganizationRecord.mockResolvedValue({ organization: "CORG", treasury: "CTREASURY", owner: "GOWNER" });
      repository.createConfirmed.mockResolvedValue({ id: "org1", name: "Acme DAO" });

      const result = await service.submitCreateIntent("user1", "intent1", "SIGNED");

      expect(repository.createConfirmed).toHaveBeenCalledWith({
        name: "Acme DAO",
        slug: "acme-dao",
        onChainOrgId: 7n,
        organizationContractAddr: "CORG",
        treasuryContractAddr: "CTREASURY",
        ownerUserId: "user1",
      });
      expect(result).toEqual({ id: "org1", name: "Acme DAO" });
    });

    it("throws CHAIN_SUBMISSION_FAILED when the transaction never confirms, and does not persist an org", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: null,
        type: "ORGANIZATION_CREATE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { name: "Acme DAO", slug: "acme-dao" },
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "TX1", status: "PENDING" });
      chainAdapter.waitForConfirmedOrgId.mockResolvedValue(null);

      await expect(service.submitCreateIntent("user1", "intent1", "SIGNED")).rejects.toMatchObject({
        code: "CHAIN_SUBMISSION_FAILED",
      } satisfies Partial<DomainException>);
      expect(repository.createConfirmed).not.toHaveBeenCalled();
    });
  });

  describe("buildAddMemberIntent", () => {
    it("throws USER_NOT_FOUND when no user exists for the given email", async () => {
      const { service, repository } = createMocks();
      repository.findUserByEmail.mockResolvedValue(null);

      await expect(service.buildAddMemberIntent("org1", "user1", "GADMIN", "nobody@example.com", "HR")).rejects.toMatchObject({
        code: "USER_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("throws VALIDATION_ERROR when the user is already a member", async () => {
      const { service, repository } = createMocks();
      repository.findUserByEmail.mockResolvedValue({ id: "user2", primaryWallet: "GMEMBER" });
      repository.findMembershipByUserId.mockResolvedValue({ id: "member1" });

      await expect(service.buildAddMemberIntent("org1", "user1", "GADMIN", "member@example.com", "HR")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      } satisfies Partial<DomainException>);
    });

    it("throws VALIDATION_ERROR when the invited user has no linked wallet", async () => {
      const { service, repository } = createMocks();
      repository.findUserByEmail.mockResolvedValue({ id: "user2", primaryWallet: null });
      repository.findMembershipByUserId.mockResolvedValue(null);

      await expect(service.buildAddMemberIntent("org1", "user1", "GADMIN", "member@example.com", "HR")).rejects.toMatchObject({
        code: "VALIDATION_ERROR",
      } satisfies Partial<DomainException>);
    });

    it("builds an ORGANIZATION_GRANT_ROLE intent scoped to the org", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findUserByEmail.mockResolvedValue({ id: "user2", primaryWallet: "GMEMBER" });
      repository.findMembershipByUserId.mockResolvedValue(null);
      repository.findById.mockResolvedValue({ id: "org1", organizationContractAddr: "CORG" });
      chainAdapter.buildGrantRoleXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      await service.buildAddMemberIntent("org1", "user1", "GADMIN", "member@example.com", "HR");

      expect(chainAdapter.buildGrantRoleXdr).toHaveBeenCalledWith({
        organizationContractAddr: "CORG",
        callerAddress: "GADMIN",
        memberAddress: "GMEMBER",
        role: "HR",
      });
      expect(intentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org1", type: "ORGANIZATION_GRANT_ROLE" }),
      );
    });
  });

  describe("buildRemoveMemberIntent", () => {
    it("throws INVALID_STATE_TRANSITION when removing the last remaining owner", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue({ id: "org1", organizationContractAddr: "CORG" });
      repository.findMemberById.mockResolvedValue({ id: "member1", role: "OWNER", user: { primaryWallet: "GOWNER" } });
      repository.countOwners.mockResolvedValue(1);

      await expect(service.buildRemoveMemberIntent("org1", "user1", "GADMIN", "member1")).rejects.toMatchObject({
        code: "INVALID_STATE_TRANSITION",
      } satisfies Partial<DomainException>);
    });

    it("allows removing an owner when another owner remains", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      repository.findById.mockResolvedValue({ id: "org1", organizationContractAddr: "CORG" });
      repository.findMemberById.mockResolvedValue({ id: "member1", role: "OWNER", user: { primaryWallet: "GOWNER2" } });
      repository.countOwners.mockResolvedValue(2);
      chainAdapter.buildRevokeRoleXdr.mockResolvedValue({ unsignedXdr: "UNSIGNED" });
      intentRepository.create.mockResolvedValue({ id: "intent1" });

      const result = await service.buildRemoveMemberIntent("org1", "user1", "GADMIN", "member1");

      expect(result.intentId).toBe("intent1");
    });
  });

  describe("submitRemoveMemberIntent", () => {
    it("deletes the Postgres membership row once the revoke confirms on-chain", async () => {
      const { service, repository, chainAdapter, intentRepository } = createMocks();
      intentRepository.findById.mockResolvedValue({
        id: "intent1",
        organizationId: "org1",
        type: "ORGANIZATION_REVOKE_ROLE",
        consumedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        metadata: { memberId: "member1" },
      });
      chainAdapter.submitSignedXdr.mockResolvedValue({ stellarTxHash: "TX1", status: "PENDING" });
      chainAdapter.waitForConfirmedSuccess.mockResolvedValue(true);

      const result = await service.submitRemoveMemberIntent("org1", "intent1", "SIGNED");

      expect(repository.deleteMember).toHaveBeenCalledWith("member1");
      expect(result).toEqual({ status: "removed" });
    });
  });
});
