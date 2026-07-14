import type * as StellarSdk from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientFrom = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof StellarSdk>("@stellar/stellar-sdk");
  return {
    ...actual,
    contract: { ...actual.contract, Client: { from: clientFrom } },
  };
});

const {
  buildCreateMilestoneTransaction,
  buildFundMilestoneTransaction,
  buildApproveMilestoneTransaction,
  buildReleaseMilestoneTransaction,
  buildCancelMilestoneTransaction,
} = await import("./milestone-engine-client.js");
const { stellarNetworkConfig } = await import("./network.js");
const { SimulationFailedError } = await import("./simulation.js");

const config = stellarNetworkConfig();

describe("milestone-engine-client", () => {
  beforeEach(() => {
    clientFrom.mockReset();
  });

  it("buildCreateMilestoneTransaction encodes args and returns unsigned XDR", async () => {
    const create_milestone = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_CREATE_XDR" });
    clientFrom.mockResolvedValue({ create_milestone });

    const result = await buildCreateMilestoneTransaction({
      milestoneEngineContractId: "CMILESTONE",
      callerAddress: "GFINANCE",
      onChainOrgId: 1n,
      contractorAddress: "GCONTRACTOR",
      amountStroops: 500_0000000n,
      config,
    });

    expect(create_milestone).toHaveBeenCalledWith(
      { caller: "GFINANCE", org_id: 1n, contractor: "GCONTRACTOR", amount: 500_0000000n },
      { publicKey: "GFINANCE" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_CREATE_XDR" });
  });

  it.each([
    ["fund_milestone", buildFundMilestoneTransaction],
    ["approve_milestone", buildApproveMilestoneTransaction],
    ["release_milestone", buildReleaseMilestoneTransaction],
    ["cancel_milestone", buildCancelMilestoneTransaction],
  ] as const)("%s encodes args and returns unsigned XDR", async (method, build) => {
    const contractFn = vi.fn().mockResolvedValue({ toXDR: () => `UNSIGNED_${method.toUpperCase()}_XDR` });
    clientFrom.mockResolvedValue({ [method]: contractFn });

    const result = await build({
      milestoneEngineContractId: "CMILESTONE",
      callerAddress: "GFINANCE",
      onChainOrgId: 1n,
      onChainMilestoneId: 7n,
      config,
    });

    expect(contractFn).toHaveBeenCalledWith(
      { caller: "GFINANCE", org_id: 1n, milestone_id: 7n },
      { publicKey: "GFINANCE" },
    );
    expect(result).toEqual({ unsignedXdr: `UNSIGNED_${method.toUpperCase()}_XDR` });
  });

  it("throws SimulationFailedError on a failed simulation", async () => {
    const fund_milestone = vi.fn().mockResolvedValue({ toXDR: () => "XDR", simulation: { error: "some error" } });
    clientFrom.mockResolvedValue({ fund_milestone });

    await expect(
      buildFundMilestoneTransaction({
        milestoneEngineContractId: "CMILESTONE",
        callerAddress: "GFINANCE",
        onChainOrgId: 1n,
        onChainMilestoneId: 7n,
        config,
      }),
    ).rejects.toThrow(SimulationFailedError);
  });
});
