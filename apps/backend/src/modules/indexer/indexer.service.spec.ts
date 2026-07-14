import { describe, expect, it, vi } from "vitest";

import { IndexerService } from "./indexer.service";

function createMocks() {
  const repository = {
    getCursor: vi.fn(),
    upsertCursor: vi.fn(),
    listOrganizationContracts: vi.fn().mockResolvedValue([]),
    findOrganizationIdByOnChainId: vi.fn(),
    upsertTransaction: vi.fn(),
    updateMilestoneStatusByOnChainId: vi.fn(),
  };
  const chainAdapter = {
    getLatestLedgerSequence: vi.fn(),
    getContractEvents: vi.fn(),
  };
  const config = {
    get: vi.fn((key: string) => `CONTRACT_${key}`),
  };
  const service = new IndexerService(repository as never, chainAdapter as never, config as never);
  return { service, repository, chainAdapter };
}

const singletonAddresses = [
  "CONTRACT_STELLAR_FACTORY_CONTRACT_ADDRESS",
  "CONTRACT_STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS",
  "CONTRACT_STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS",
  "CONTRACT_STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS",
];

describe("IndexerService", () => {
  describe("pollAll / cursor bootstrapping", () => {
    it("baselines a brand-new contract's cursor at the current ledger without backfilling history", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockResolvedValue(null);
      chainAdapter.getLatestLedgerSequence.mockResolvedValue(1000);

      await service.pollAll();

      expect(chainAdapter.getContractEvents).not.toHaveBeenCalled();
      for (const address of singletonAddresses) {
        expect(repository.upsertCursor).toHaveBeenCalledWith(address, 1000n);
      }
    });

    it("polls from cursor+1 and advances the cursor to the max processed ledger", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockResolvedValue({ lastLedgerSequence: 500n });
      chainAdapter.getContractEvents.mockResolvedValue([]);

      await service.pollAll();

      expect(chainAdapter.getContractEvents).toHaveBeenCalledWith(expect.any(String), 501);
      expect(repository.upsertCursor).not.toHaveBeenCalled();
    });

    it("one contract's polling failure doesn't stop the others from being polled", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockResolvedValue({ lastLedgerSequence: 500n });
      chainAdapter.getContractEvents.mockRejectedValueOnce(new Error("RPC down")).mockResolvedValue([]);

      await expect(service.pollAll()).resolves.toBeUndefined();
      expect(chainAdapter.getContractEvents.mock.calls.length).toBeGreaterThan(1);
    });

    /**
     * Found running against real Testnet (docs/DEVELOPMENT_PLAN.md's Step
     * 13 entry): `getLatestLedger()` (consensus) can be a ledger or two
     * ahead of what `getEvents` will actually accept as `startLedger` (the
     * RPC node's own event-indexing frontier) — a freshly baselined cursor
     * hits this immediately on its very next poll. Not a real failure.
     */
    it("treats a 'startLedger not yet in ledger range' RPC error as nothing new yet, not a failure", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockResolvedValue({ lastLedgerSequence: 500n });
      chainAdapter.getContractEvents.mockRejectedValue({
        code: -32600,
        message: "startLedger must be within the ledger range: 100 - 499",
      });

      await expect(service.pollAll()).resolves.toBeUndefined();
      expect(repository.upsertCursor).not.toHaveBeenCalled();
    });
  });

  describe("treasury events", () => {
    async function pollSingleOrg(events: unknown[]) {
      const { service, repository, chainAdapter } = createMocks();
      repository.listOrganizationContracts.mockResolvedValue([
        { id: "org1", organizationContractAddr: "CORG", treasuryContractAddr: "CTREASURY" },
      ]);
      repository.getCursor.mockImplementation((address: string) =>
        Promise.resolve(address === "CTREASURY" ? { lastLedgerSequence: 100n } : { lastLedgerSequence: 999999n }),
      );
      chainAdapter.getContractEvents.mockImplementation((address: string) => Promise.resolve(address === "CTREASURY" ? events : []));

      await service.pollAll();
      return { repository };
    }

    it("inserts a DEPOSIT transaction for a deposited event", async () => {
      const { repository } = await pollSingleOrg([
        {
          id: "evt1",
          ledger: 101,
          txHash: "TX1",
          topic: ["deposited", 1n],
          value: { from: "GDEPOSITOR", amount: 150000000n },
        },
      ]);

      expect(repository.upsertTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org1",
          type: "DEPOSIT",
          amount: "15",
          fromAddress: "GDEPOSITOR",
          toAddress: "CTREASURY",
          stellarEventId: "evt1",
        }),
      );
    });

    it("maps transferred_out(reason=payroll) to PAYROLL_DISBURSEMENT and transferred_out(reason=milestone_fund) to MILESTONE_FUND", async () => {
      const { repository } = await pollSingleOrg([
        {
          id: "evt2",
          ledger: 102,
          txHash: "TX2",
          topic: ["transferred_out", 1n, "payroll"],
          value: { spender: "CENGINE", to: "GEMPLOYEE", amount: 50000000n },
        },
        {
          id: "evt3",
          ledger: 103,
          txHash: "TX3",
          topic: ["transferred_out", 1n, "milestone_fund"],
          value: { spender: "CENGINE", to: "CTREASURY", amount: 70000000n },
        },
      ]);

      expect(repository.upsertTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: "PAYROLL_DISBURSEMENT" }));
      expect(repository.upsertTransaction).toHaveBeenCalledWith(expect.objectContaining({ type: "MILESTONE_FUND" }));
    });

    it("skips (doesn't throw) an unrecognized transfer_out reason", async () => {
      const { repository } = await pollSingleOrg([
        {
          id: "evt4",
          ledger: 104,
          txHash: "TX4",
          topic: ["transferred_out", 1n, "some_future_reason"],
          value: { spender: "CENGINE", to: "GX", amount: 1n },
        },
      ]);

      expect(repository.upsertTransaction).not.toHaveBeenCalled();
    });
  });

  describe("milestone_engine events", () => {
    it("resolves org_id back to an Organization and updates Milestone.status by onChainMilestoneId", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockImplementation((address: string) =>
        Promise.resolve(address === "CONTRACT_STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS" ? { lastLedgerSequence: 10n } : { lastLedgerSequence: 999999n }),
      );
      chainAdapter.getContractEvents.mockImplementation((address: string) =>
        Promise.resolve(
          address === "CONTRACT_STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS"
            ? [{ id: "evt5", ledger: 11, txHash: "TX5", topic: ["milestone_released", 7n, 3n], value: { contractor: "GC", amount: 1n } }]
            : [],
        ),
      );
      repository.findOrganizationIdByOnChainId.mockResolvedValue("org1");

      await service.pollAll();

      expect(repository.findOrganizationIdByOnChainId).toHaveBeenCalledWith(7n);
      expect(repository.updateMilestoneStatusByOnChainId).toHaveBeenCalledWith("org1", 3n, "RELEASED");
    });

    it("warns and skips when the event's org_id has no matching Organization", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockImplementation((address: string) =>
        Promise.resolve(address === "CONTRACT_STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS" ? { lastLedgerSequence: 10n } : { lastLedgerSequence: 999999n }),
      );
      chainAdapter.getContractEvents.mockImplementation((address: string) =>
        Promise.resolve(
          address === "CONTRACT_STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS"
            ? [{ id: "evt6", ledger: 11, txHash: "TX6", topic: ["milestone_funded", 999n, 1n], value: {} }]
            : [],
        ),
      );
      repository.findOrganizationIdByOnChainId.mockResolvedValue(null);

      await expect(service.pollAll()).resolves.toBeUndefined();
      expect(repository.updateMilestoneStatusByOnChainId).not.toHaveBeenCalled();
    });
  });

  describe("events with no DB effect", () => {
    it("does not throw for org_created (payroll_factory) or employee_registry/payroll_engine events", async () => {
      const { service, repository, chainAdapter } = createMocks();
      repository.getCursor.mockImplementation((address: string) =>
        Promise.resolve(address === "CONTRACT_STELLAR_FACTORY_CONTRACT_ADDRESS" ? { lastLedgerSequence: 10n } : { lastLedgerSequence: 999999n }),
      );
      chainAdapter.getContractEvents.mockImplementation((address: string) =>
        Promise.resolve(
          address === "CONTRACT_STELLAR_FACTORY_CONTRACT_ADDRESS"
            ? [{ id: "evt7", ledger: 11, txHash: "TX7", topic: ["org_created", 1n], value: { organization: "CA", treasury: "CB", owner: "GA" } }]
            : [],
        ),
      );

      await expect(service.pollAll()).resolves.toBeUndefined();
      expect(repository.upsertTransaction).not.toHaveBeenCalled();
      expect(repository.upsertCursor).toHaveBeenCalledWith("CONTRACT_STELLAR_FACTORY_CONTRACT_ADDRESS", 11n);
    });
  });
});
