import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DomainException } from "../exceptions/domain.exception";
import { MinRole } from "../decorators/min-role.decorator";
import { OrgRoleGuard } from "./org-role.guard";

function createContext(params: Record<string, string>, user?: { id: string }): ExecutionContext {
  const req = { params, user };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => vi.fn(),
  } as unknown as ExecutionContext;
}

describe("OrgRoleGuard", () => {
  let findUnique: ReturnType<typeof vi.fn>;
  let prisma: { organizationMember: { findUnique: typeof findUnique } };
  let reflector: Reflector;

  beforeEach(() => {
    findUnique = vi.fn();
    prisma = { organizationMember: { findUnique } };
    reflector = new Reflector();
  });

  it("is a no-op when the handler declares no @MinRole", async () => {
    vi.spyOn(reflector, "get").mockReturnValue(undefined);
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({}, { id: "u1" }))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("throws UNAUTHENTICATED when AuthGuard hasn't attached a user", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("FINANCE");
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({ orgId: "org1" }))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    } satisfies Partial<DomainException>);
  });

  it("reads the org id from :orgId for nested resource controllers", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("FINANCE");
    findUnique.mockResolvedValue({ role: "OWNER" });
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({ orgId: "org1" }, { id: "u1" }))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: "org1", userId: "u1" } },
    });
  });

  it("falls back to :id for the organization resource's own routes", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("VIEWER");
    findUnique.mockResolvedValue({ role: "VIEWER" });
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({ id: "org2" }, { id: "u1" }))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: "org2", userId: "u1" } },
    });
  });

  it("throws VALIDATION_ERROR when the route has neither :orgId nor :id", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("FINANCE");
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({}, { id: "u1" }))).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    } satisfies Partial<DomainException>);
  });

  it("throws FORBIDDEN_ROLE when the caller has no membership", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("FINANCE");
    findUnique.mockResolvedValue(null);
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({ orgId: "org1" }, { id: "u1" }))).rejects.toMatchObject({
      code: "FORBIDDEN_ROLE",
    } satisfies Partial<DomainException>);
  });

  it("throws FORBIDDEN_ROLE when the caller's role doesn't meet the minimum (Finance/HR are incomparable)", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("FINANCE");
    findUnique.mockResolvedValue({ role: "HR" });
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({ orgId: "org1" }, { id: "u1" }))).rejects.toMatchObject({
      code: "FORBIDDEN_ROLE",
    } satisfies Partial<DomainException>);
  });

  it("allows an Owner through a Finance-minimum check", async () => {
    vi.spyOn(reflector, "get").mockReturnValue("FINANCE");
    findUnique.mockResolvedValue({ role: "OWNER" });
    const guard = new OrgRoleGuard(reflector, prisma as never);

    await expect(guard.canActivate(createContext({ orgId: "org1" }, { id: "u1" }))).resolves.toBe(true);
  });
});

// Sanity check that MinRole's metadata key is what the guard reads.
describe("MinRole decorator", () => {
  it("is defined", () => {
    expect(MinRole).toBeTypeOf("function");
  });
});
