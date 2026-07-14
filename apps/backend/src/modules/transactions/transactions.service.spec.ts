import { describe, expect, it, vi } from "vitest";

import { TransactionsService } from "./transactions.service";

function createMocks() {
  const repository = { findMany: vi.fn() };
  const service = new TransactionsService(repository as never);
  return { service, repository };
}

describe("TransactionsService", () => {
  it("passes filters through and returns a paginated envelope", async () => {
    const { service, repository } = createMocks();
    repository.findMany.mockResolvedValue({ data: [{ id: "tx1" }], total: 37 });

    const result = await service.list("org1", { page: 2, pageSize: 10, type: "DEPOSIT", status: "CONFIRMED" });

    expect(repository.findMany).toHaveBeenCalledWith(
      "org1",
      { type: "DEPOSIT", status: "CONFIRMED", from: undefined, to: undefined },
      2,
      10,
    );
    expect(result).toEqual({ data: [{ id: "tx1" }], meta: { page: 2, pageSize: 10, total: 37 } });
  });

  it("defaults to no filters when none are given", async () => {
    const { service, repository } = createMocks();
    repository.findMany.mockResolvedValue({ data: [], total: 0 });

    await service.list("org1", { page: 1, pageSize: 20 });

    expect(repository.findMany).toHaveBeenCalledWith("org1", { type: undefined, status: undefined, from: undefined, to: undefined }, 1, 20);
  });
});
