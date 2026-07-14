import { beforeEach, describe, expect, it, vi } from "vitest";

const requestAccess = vi.fn();
const signMessage = vi.fn();
const signTransaction = vi.fn();
const isConnected = vi.fn();

vi.mock("@stellar/freighter-api", () => ({
  default: { requestAccess, signMessage, signTransaction, isConnected },
}));

const { connectFreighter, FreighterError, isFreighterAvailable, signMessageWithFreighter, signTransactionWithFreighter } =
  await import("./freighter.js");

describe("freighter wrapper", () => {
  beforeEach(() => {
    requestAccess.mockReset();
    signMessage.mockReset();
    signTransaction.mockReset();
    isConnected.mockReset();
  });

  describe("isFreighterAvailable", () => {
    it("is true when the extension reports connected with no error", async () => {
      isConnected.mockResolvedValue({ isConnected: true });
      await expect(isFreighterAvailable()).resolves.toBe(true);
    });

    it("is false when the extension reports an error", async () => {
      isConnected.mockResolvedValue({ isConnected: false, error: { code: 1, message: "not found" } });
      await expect(isFreighterAvailable()).resolves.toBe(false);
    });
  });

  describe("connectFreighter", () => {
    it("returns the connected address", async () => {
      requestAccess.mockResolvedValue({ address: "GABC123" });
      await expect(connectFreighter()).resolves.toEqual({ address: "GABC123" });
    });

    it("throws a FreighterError when the extension returns an error", async () => {
      requestAccess.mockResolvedValue({ address: "", error: { code: -1, message: "User declined access" } });
      await expect(connectFreighter()).rejects.toThrow(FreighterError);
    });
  });

  describe("signMessageWithFreighter", () => {
    it("normalizes a string signedMessage (newer extension) unchanged", async () => {
      signMessage.mockResolvedValue({ signedMessage: "c29tZS1zaWc=", signerAddress: "GABC123" });
      await expect(signMessageWithFreighter("hello")).resolves.toEqual({
        signedMessage: "c29tZS1zaWc=",
        signerAddress: "GABC123",
      });
    });

    it("normalizes a Buffer signedMessage (older extension) to base64", async () => {
      signMessage.mockResolvedValue({ signedMessage: Buffer.from("some-sig"), signerAddress: "GABC123" });
      const result = await signMessageWithFreighter("hello");
      expect(result.signedMessage).toBe(Buffer.from("some-sig").toString("base64"));
    });

    it("throws when signedMessage is null", async () => {
      signMessage.mockResolvedValue({ signedMessage: null, signerAddress: "GABC123" });
      await expect(signMessageWithFreighter("hello")).rejects.toThrow(FreighterError);
    });

    it("throws a FreighterError when the extension returns an error", async () => {
      signMessage.mockResolvedValue({ signedMessage: null, signerAddress: "", error: { code: -1, message: "declined" } });
      await expect(signMessageWithFreighter("hello")).rejects.toThrow("declined");
    });
  });

  describe("signTransactionWithFreighter", () => {
    it("returns the signed XDR", async () => {
      signTransaction.mockResolvedValue({ signedTxXdr: "AAAA...", signerAddress: "GABC123" });
      await expect(signTransactionWithFreighter("unsigned-xdr")).resolves.toEqual({
        signedTxXdr: "AAAA...",
        signerAddress: "GABC123",
      });
    });

    it("throws a FreighterError when the extension returns an error", async () => {
      signTransaction.mockResolvedValue({ signedTxXdr: "", signerAddress: "", error: { code: -1, message: "declined" } });
      await expect(signTransactionWithFreighter("unsigned-xdr")).rejects.toThrow(FreighterError);
    });
  });
});
