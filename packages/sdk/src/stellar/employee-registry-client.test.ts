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
  buildRegisterEmployeeTransaction,
  buildUpdateEmployeeTransaction,
  buildDeactivateEmployeeTransaction,
  toPayFrequencyScVal,
} = await import("./employee-registry-client.js");
const { stellarNetworkConfig } = await import("./network.js");
const { SimulationFailedError } = await import("./simulation.js");

const config = stellarNetworkConfig();

describe("toPayFrequencyScVal", () => {
  it("maps our WEEKLY/BI_WEEKLY/MONTHLY to the contract's PayFrequency tags", () => {
    expect(toPayFrequencyScVal("WEEKLY")).toEqual({ tag: "Weekly", values: undefined });
    expect(toPayFrequencyScVal("BI_WEEKLY")).toEqual({ tag: "BiWeekly", values: undefined });
    expect(toPayFrequencyScVal("MONTHLY")).toEqual({ tag: "Monthly", values: undefined });
  });
});

describe("employee-registry-client", () => {
  beforeEach(() => {
    clientFrom.mockReset();
  });

  it("buildRegisterEmployeeTransaction encodes args and returns unsigned XDR", async () => {
    const register_employee = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_REGISTER_XDR" });
    clientFrom.mockResolvedValue({ register_employee });

    const result = await buildRegisterEmployeeTransaction({
      employeeRegistryContractId: "CREGISTRY",
      callerAddress: "GHR",
      orgId: 1n,
      wallet: "GEMP",
      salaryStroops: 5000_0000000n,
      currency: "CUSDC",
      frequency: "MONTHLY",
      config,
    });

    expect(register_employee).toHaveBeenCalledWith(
      {
        caller: "GHR",
        org_id: 1n,
        wallet: "GEMP",
        salary: 5000_0000000n,
        currency: "CUSDC",
        frequency: { tag: "Monthly", values: undefined },
      },
      { publicKey: "GHR" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_REGISTER_XDR" });
  });

  it("buildRegisterEmployeeTransaction throws SimulationFailedError on a failed simulation", async () => {
    const register_employee = vi.fn().mockResolvedValue({
      toXDR: () => "XDR",
      simulation: { error: "some contract error" },
    });
    clientFrom.mockResolvedValue({ register_employee });

    await expect(
      buildRegisterEmployeeTransaction({
        employeeRegistryContractId: "CREGISTRY",
        callerAddress: "GHR",
        orgId: 1n,
        wallet: "GEMP",
        salaryStroops: 1n,
        currency: "CUSDC",
        frequency: "MONTHLY",
        config,
      }),
    ).rejects.toThrow(SimulationFailedError);
  });

  it("buildUpdateEmployeeTransaction encodes args and returns unsigned XDR", async () => {
    const update_employee = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_UPDATE_XDR" });
    clientFrom.mockResolvedValue({ update_employee });

    const result = await buildUpdateEmployeeTransaction({
      employeeRegistryContractId: "CREGISTRY",
      callerAddress: "GHR",
      orgId: 1n,
      employeeId: 7n,
      salaryStroops: 6000_0000000n,
      frequency: "BI_WEEKLY",
      config,
    });

    expect(update_employee).toHaveBeenCalledWith(
      {
        caller: "GHR",
        org_id: 1n,
        employee_id: 7n,
        salary: 6000_0000000n,
        frequency: { tag: "BiWeekly", values: undefined },
      },
      { publicKey: "GHR" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_UPDATE_XDR" });
  });

  it("buildDeactivateEmployeeTransaction encodes args and returns unsigned XDR", async () => {
    const deactivate_employee = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_DEACTIVATE_XDR" });
    clientFrom.mockResolvedValue({ deactivate_employee });

    const result = await buildDeactivateEmployeeTransaction({
      employeeRegistryContractId: "CREGISTRY",
      callerAddress: "GHR",
      orgId: 1n,
      employeeId: 7n,
      config,
    });

    expect(deactivate_employee).toHaveBeenCalledWith(
      { caller: "GHR", org_id: 1n, employee_id: 7n },
      { publicKey: "GHR" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_DEACTIVATE_XDR" });
  });
});
