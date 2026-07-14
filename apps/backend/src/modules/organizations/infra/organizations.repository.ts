import { Injectable } from "@nestjs/common";
import type { Organization, OrganizationMember, OrgRole, User } from "@prisma/client";

import { PrismaService } from "../../../prisma/prisma.service";

export type MemberWithUser = OrganizationMember & { user: Pick<User, "id" | "email" | "name" | "primaryWallet"> };

@Injectable()
export class OrganizationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async slugExists(slug: string): Promise<boolean> {
    const existing = await this.prisma.organization.findUnique({ where: { slug }, select: { id: true } });
    return existing !== null;
  }

  async findManyForUser(userId: string): Promise<Organization[]> {
    return this.prisma.organization.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(organizationId: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { id: organizationId } });
  }

  async updateName(organizationId: string, name: string): Promise<Organization> {
    return this.prisma.organization.update({ where: { id: organizationId }, data: { name } });
  }

  /**
   * docs/API_SPECIFICATION.md "Organizations": the Organization row (and
   * the creator's OWNER membership) is only persisted once
   * `create_organization` has actually confirmed on-chain — there is no
   * optimistic pre-confirmation row the way Employees has, since
   * `onChainOrgId`/`organizationContractAddr`/`treasuryContractAddr` are
   * all required, unique columns with no placeholder value.
   */
  async createConfirmed(data: {
    name: string;
    slug: string;
    onChainOrgId: bigint;
    organizationContractAddr: string;
    treasuryContractAddr: string;
    ownerUserId: string;
  }): Promise<Organization> {
    return this.prisma.organization.create({
      data: {
        name: data.name,
        slug: data.slug,
        onChainOrgId: data.onChainOrgId,
        organizationContractAddr: data.organizationContractAddr,
        treasuryContractAddr: data.treasuryContractAddr,
        members: {
          create: { userId: data.ownerUserId, role: "OWNER" },
        },
      },
    });
  }

  async findMembers(organizationId: string): Promise<MemberWithUser[]> {
    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, email: true, name: true, primaryWallet: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async findMemberById(organizationId: string, memberId: string): Promise<MemberWithUser | null> {
    return this.prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId },
      include: { user: { select: { id: true, email: true, name: true, primaryWallet: true } } },
    });
  }

  async findMembershipByUserId(organizationId: string, userId: string): Promise<OrganizationMember | null> {
    return this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async countOwners(organizationId: string): Promise<number> {
    return this.prisma.organizationMember.count({ where: { organizationId, role: "OWNER" } });
  }

  /** Backs both "add member" and "change role" — both call `grant_role` on-chain, differing only in whether the Postgres row already existed. */
  async upsertMember(organizationId: string, userId: string, role: OrgRole): Promise<MemberWithUser> {
    return this.prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, role },
      update: { role },
      include: { user: { select: { id: true, email: true, name: true, primaryWallet: true } } },
    });
  }

  async deleteMember(memberId: string): Promise<void> {
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
  }
}
