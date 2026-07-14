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

const { buildRunPayrollTransaction } = await import("./payroll-engine-client.js");
const { stellarNetworkConfig } = await import("./network.js");
const { SimulationFailedError } = await import("./simulation.js");

const config = stellarNetworkConfig();

describe("payroll-engine-client", () => {
  beforeEach(() => {
    clientFrom.mockReset();
  });

  it("buildRunPayrollTransaction encodes args and returns unsigned XDR", async () => {
    const run_payroll = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_RUN_PAYROLL_XDR" });
    clientFrom.mockResolvedValue({ run_payroll });

    const result = await buildRunPayrollTransaction({
      payrollEngineContractId: "CPAYROLL",
      authorizerAddress: "GFINANCE",
      onChainOrgId: 1n,
      runId: 12345n,
      employeeIds: [1n, 2n, 3n],
      config,
    });

    expect(run_payroll).toHaveBeenCalledWith(
      { authorizer: "GFINANCE", org_id: 1n, run_id: 12345n, employee_ids: [1n, 2n, 3n] },
      { publicKey: "GFINANCE" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_RUN_PAYROLL_XDR" });
  });

  it("throws SimulationFailedError on a failed simulation (e.g. batch too large)", async () => {
    const run_payroll = vi.fn().mockResolvedValue({
      toXDR: () => "XDR",
      simulation: { error: "Memory(OutOfBoundsGrowth)" },
    });
    clientFrom.mockResolvedValue({ run_payroll });

    await expect(
      buildRunPayrollTransaction({
        payrollEngineContractId: "CPAYROLL",
        authorizerAddress: "GFINANCE",
        onChainOrgId: 1n,
        runId: 1n,
        employeeIds: [1n],
        config,
      }),
    ).rejects.toThrow(SimulationFailedError);
  });
});
