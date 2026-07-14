import type * as StellarSdk from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const clientFrom = vi.fn();
const sendTransaction = vi.fn();
const fromXDR = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof StellarSdk>("@stellar/stellar-sdk");
  return {
    ...actual,
    contract: { Client: { from: clientFrom } },
    rpc: { Server: vi.fn().mockImplementation(function MockRpcServer() {
      return { sendTransaction };
    }) },
    TransactionBuilder: { ...actual.TransactionBuilder, fromXDR },
  };
});

const {
  buildTreasuryDepositTransaction,
  buildTreasuryWithdrawTransaction,
  getTreasuryBalance,
  submitSignedTransaction,
} = await import("./treasury-client.js");
const { stellarNetworkConfig } = await import("./network.js");

const config = stellarNetworkConfig();

describe("treasury-client", () => {
  beforeEach(() => {
    clientFrom.mockReset();
    sendTransaction.mockReset();
    fromXDR.mockReset();
  });

  it("buildTreasuryDepositTransaction fetches a client scoped to the org's treasury and returns unsigned XDR", async () => {
    const deposit = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_DEPOSIT_XDR" });
    clientFrom.mockResolvedValue({ deposit });

    const result = await buildTreasuryDepositTransaction({
      treasuryContractId: "CTREASURY",
      fromAddress: "GDEPOSITOR",
      amountStroops: 500_000_000n,
      config,
    });

    expect(clientFrom).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: "CTREASURY", rpcUrl: config.rpcUrl }),
    );
    expect(deposit).toHaveBeenCalledWith(
      { from: "GDEPOSITOR", amount: 500_000_000n },
      { publicKey: "GDEPOSITOR" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_DEPOSIT_XDR" });
  });

  it("buildTreasuryWithdrawTransaction passes caller/to/amount through", async () => {
    const withdraw = vi.fn().mockResolvedValue({ toXDR: () => "UNSIGNED_WITHDRAW_XDR" });
    clientFrom.mockResolvedValue({ withdraw });

    const result = await buildTreasuryWithdrawTransaction({
      treasuryContractId: "CTREASURY",
      callerAddress: "GADMIN",
      toAddress: "GDEST",
      amountStroops: 100_0000000n,
      config,
    });

    expect(withdraw).toHaveBeenCalledWith(
      { caller: "GADMIN", to: "GDEST", amount: 100_0000000n },
      { publicKey: "GADMIN" },
    );
    expect(result).toEqual({ unsignedXdr: "UNSIGNED_WITHDRAW_XDR" });
  });

  it("getTreasuryBalance returns the live on-chain balance", async () => {
    const get_balance = vi.fn().mockResolvedValue({ result: 500_000_000n });
    clientFrom.mockResolvedValue({ get_balance });

    await expect(getTreasuryBalance("CTREASURY", config)).resolves.toBe(500_000_000n);
  });

  it("submitSignedTransaction submits and returns the tx hash without waiting for confirmation", async () => {
    fromXDR.mockReturnValue({ mock: "tx" });
    sendTransaction.mockResolvedValue({ status: "PENDING", hash: "abc123" });

    const result = await submitSignedTransaction("SIGNED_XDR", config);

    expect(result).toEqual({ stellarTxHash: "abc123", status: "PENDING" });
  });

  it("submitSignedTransaction throws when the network rejects the transaction", async () => {
    fromXDR.mockReturnValue({ mock: "tx" });
    sendTransaction.mockResolvedValue({ status: "ERROR", hash: "abc123", errorResult: "boom" });

    await expect(submitSignedTransaction("SIGNED_XDR", config)).rejects.toThrow("Transaction submission failed");
  });
});
