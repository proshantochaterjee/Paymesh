import { describe, expect, it, vi } from "vitest";

import { DomainException } from "../../common/exceptions/domain.exception";
import { ContractorsService } from "./contractors.service";

function createMocks() {
  const repository = {
    findMany: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
  };
  const service = new ContractorsService(repository as never);
  return { service, repository };
}

describe("ContractorsService", () => {
  describe("getById / update / deactivate", () => {
    it("throws CONTRACTOR_NOT_FOUND when the contractor doesn't exist in this org", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.getById("org1", "contractor1")).rejects.toMatchObject({
        code: "CONTRACTOR_NOT_FOUND",
      } satisfies Partial<DomainException>);
    });

    it("update throws CONTRACTOR_NOT_FOUND before attempting the write", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.update("org1", "contractor1", { fullName: "New Name" })).rejects.toMatchObject({
        code: "CONTRACTOR_NOT_FOUND",
      } satisfies Partial<DomainException>);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("deactivate throws CONTRACTOR_NOT_FOUND before attempting the write", async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.deactivate("org1", "contractor1")).rejects.toMatchObject({
        code: "CONTRACTOR_NOT_FOUND",
      } satisfies Partial<DomainException>);
      expect(repository.deactivate).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("creates a contractor via the repository", async () => {
      const { service, repository } = createMocks();
      repository.create.mockResolvedValue({ id: "contractor1" });

      await service.create("org1", { fullName: "Ada Lovelace", email: "ada@example.com", walletAddress: "GWALLET" });

      expect(repository.create).toHaveBeenCalledWith({
        organizationId: "org1",
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        walletAddress: "GWALLET",
      });
    });
  });
});
