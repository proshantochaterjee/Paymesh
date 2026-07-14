import type * as StellarSdk from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTransaction = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof StellarSdk>("@stellar/stellar-sdk");
  return {
    ...actual,
    rpc: { ...actual.rpc, Server: vi.fn().mockImplementation(function MockRpcServer() {
      return { getTransaction };
    }) },
    scValToNative: vi.fn((v: unknown) => `native(${String(v)})`),
  };
});

const { waitForTransactionConfirmation } = await import("./confirmation.js");
const { stellarNetworkConfig } = await import("./network.js");

const config = stellarNetworkConfig();

describe("waitForTransactionConfirmation", () => {
  beforeEach(() => {
    getTransaction.mockReset();
  });

  it("returns immediately when already confirmed, decoding the return value", async () => {
    getTransaction.mockResolvedValue({ status: "SUCCESS", returnValue: "raw-scval" });

    const result = await waitForTransactionConfirmation("hash1", config);

    expect(result).toEqual({ status: "SUCCESS", returnValue: "native(raw-scval)" });
    expect(getTransaction).toHaveBeenCalledTimes(1);
  });

  it("polls until confirmed", async () => {
    getTransaction
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({ status: "NOT_FOUND" })
      .mockResolvedValueOnce({ status: "SUCCESS", returnValue: "raw" });

    const result = await waitForTransactionConfirmation("hash1", config, { pollIntervalMs: 1 });

    expect(result.status).toBe("SUCCESS");
    expect(getTransaction).toHaveBeenCalledTimes(3);
  });

  it("gives up after the timeout and returns the last (NOT_FOUND) status", async () => {
    getTransaction.mockResolvedValue({ status: "NOT_FOUND" });

    const result = await waitForTransactionConfirmation("hash1", config, { timeoutMs: 5, pollIntervalMs: 2 });

    expect(result.status).toBe("NOT_FOUND");
  });

  it("returns a FAILED status without a returnValue", async () => {
    getTransaction.mockResolvedValue({ status: "FAILED" });

    const result = await waitForTransactionConfirmation("hash1", config);

    expect(result).toEqual({ status: "FAILED" });
  });
});
