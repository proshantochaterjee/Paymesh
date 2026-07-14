import type * as StellarSdk from "@stellar/stellar-sdk";
import { Keypair } from "@stellar/stellar-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyStellarSignature, walletChallengeMessage } from "./wallet-signature.js";
import { hash } from "@stellar/stellar-sdk";

function sep53Digest(message: string): Buffer {
  return hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]));
}

const loadAccount = vi.fn();

vi.mock("@stellar/stellar-sdk", async () => {
  const actual = await vi.importActual<typeof StellarSdk>("@stellar/stellar-sdk");
  return {
    ...actual,
    Horizon: {
      Server: vi.fn().mockImplementation(function MockServer() {
        return { loadAccount };
      }),
    },
  };
});

describe("verifyStellarSignature", () => {
  const nonce = "test-nonce-123";
  const signer = Keypair.random();

  beforeEach(() => {
    loadAccount.mockReset();
  });

  it("accepts a genuine signature from the account's sole signer (default 0 threshold)", async () => {
    loadAccount.mockResolvedValue({
      signers: [{ key: signer.publicKey(), weight: 1, type: "ed25519_public_key" }],
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    });
    const signature = signer.sign(sep53Digest(walletChallengeMessage(nonce))).toString("base64");

    const result = await verifyStellarSignature({
      horizonUrl: "https://horizon-testnet.stellar.org",
      address: signer.publicKey(),
      nonce,
      signatureBase64: signature,
    });

    expect(result).toBe(true);
  });

  it("rejects a garbage signature even when the account's threshold is 0 (regression: 0 verified weight must never trivially satisfy a 0 threshold)", async () => {
    loadAccount.mockResolvedValue({
      signers: [{ key: signer.publicKey(), weight: 1, type: "ed25519_public_key" }],
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    });

    const result = await verifyStellarSignature({
      horizonUrl: "https://horizon-testnet.stellar.org",
      address: signer.publicKey(),
      nonce,
      signatureBase64: Buffer.from("not-a-real-signature").toString("base64"),
    });

    expect(result).toBe(false);
  });

  it("rejects a valid signature from a signer whose weight doesn't meet a nonzero medium threshold", async () => {
    const lowWeightSigner = Keypair.random();
    loadAccount.mockResolvedValue({
      signers: [{ key: lowWeightSigner.publicKey(), weight: 1, type: "ed25519_public_key" }],
      thresholds: { low_threshold: 1, med_threshold: 5, high_threshold: 10 },
    });
    const signature = lowWeightSigner.sign(sep53Digest(walletChallengeMessage(nonce))).toString("base64");

    const result = await verifyStellarSignature({
      horizonUrl: "https://horizon-testnet.stellar.org",
      address: lowWeightSigner.publicKey(),
      nonce,
      signatureBase64: signature,
    });

    expect(result).toBe(false);
  });

  it("rejects a signature over the wrong nonce", async () => {
    loadAccount.mockResolvedValue({
      signers: [{ key: signer.publicKey(), weight: 1, type: "ed25519_public_key" }],
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    });
    const signature = signer.sign(sep53Digest(walletChallengeMessage("a-different-nonce"))).toString("base64");

    const result = await verifyStellarSignature({
      horizonUrl: "https://horizon-testnet.stellar.org",
      address: signer.publicKey(),
      nonce,
      signatureBase64: signature,
    });

    expect(result).toBe(false);
  });

  it("ignores non-ed25519 signers (e.g. sha256_hash/preauth_tx) when tallying weight", async () => {
    loadAccount.mockResolvedValue({
      signers: [{ key: "some-hash-signer", weight: 100, type: "sha256_hash" }],
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
    });

    const result = await verifyStellarSignature({
      horizonUrl: "https://horizon-testnet.stellar.org",
      address: signer.publicKey(),
      nonce,
      signatureBase64: Buffer.from("irrelevant").toString("base64"),
    });

    expect(result).toBe(false);
  });
});
