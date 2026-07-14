import { hash, Horizon, Keypair } from "@stellar/stellar-sdk";

/**
 * docs/AUTHENTICATION.md §2: the fixed-format message a wallet's
 * `signMessage` signs — never a raw transaction, so it can't be replayed
 * as a real payment.
 */
export function walletChallengeMessage(nonce: string): string {
  return `WorkforceOS auth challenge: ${nonce}`;
}

/**
 * SEP-53: `signMessage` implementations (Freighter included) don't sign
 * the raw message bytes — they sign `sha256("Stellar Signed Message:\n" +
 * message)`. Verifying against the raw message bytes instead makes every
 * genuine wallet signature fail (`Keypair.verify` returns false), which is
 * exactly what shipped here until this was caught by driving the real
 * flow in a browser: the unit tests fabricated signatures by signing the
 * raw bytes directly, so they never exercised real wallet output.
 */
function sep53Digest(message: string): Buffer {
  return hash(Buffer.concat([Buffer.from("Stellar Signed Message:\n", "utf8"), Buffer.from(message, "utf8")]));
}

/**
 * docs/SECURITY_MODEL.md §7: verifies not just that *a* valid Ed25519
 * signature exists, but that the claimed account's medium-threshold
 * signing requirement is met — so a single low-weight signer on a
 * multisig account can't pass as the account.
 */
export async function verifyStellarSignature(params: {
  horizonUrl: string;
  address: string;
  nonce: string;
  signatureBase64: string;
}): Promise<boolean> {
  const { horizonUrl, address, nonce, signatureBase64 } = params;

  let signatureBytes: Buffer;
  try {
    signatureBytes = Buffer.from(signatureBase64, "base64");
  } catch {
    return false;
  }
  if (signatureBytes.length === 0) return false;

  const messageDigest = sep53Digest(walletChallengeMessage(nonce));

  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(address);

  let signedWeight = 0;
  for (const signer of account.signers) {
    if (signer.type !== "ed25519_public_key") continue;
    let signerVerified: boolean;
    try {
      signerVerified = Keypair.fromPublicKey(signer.key).verify(messageDigest, signatureBytes);
    } catch {
      continue;
    }
    if (signerVerified) signedWeight += signer.weight;
  }

  // A fresh/default Stellar account has all thresholds at 0, so a weight-0
  // "no signatures verified" result would otherwise trivially satisfy
  // `0 >= 0` — always require genuine signer weight, not just threshold
  // satisfaction, so an invalid/garbage signature can never pass.
  if (signedWeight === 0) return false;

  return signedWeight >= account.thresholds.med_threshold;
}
