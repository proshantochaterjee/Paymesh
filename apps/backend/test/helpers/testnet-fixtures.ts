import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Account, Asset, BASE_FEE, Keypair, Operation, TransactionBuilder, contract } from "@stellar/stellar-sdk";
import { stellarNetworkConfig } from "@workforceos/sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const config = stellarNetworkConfig();

const deployedAddresses = JSON.parse(
  readFileSync(path.join(__dirname, "../../../../deployed-addresses.testnet.json"), "utf8"),
) as {
  usdcSac: string;
  payrollFactory: string;
  deployerPublicKey: string;
};

export const USDC_SAC = deployedAddresses.usdcSac;
export const PAYROLL_FACTORY = deployedAddresses.payrollFactory;
export const TUSDC_ISSUER = deployedAddresses.deployerPublicKey;

/**
 * Local `stellar keys` CLI identity used to deploy the project's shared
 * Testnet contracts (docs/DEPLOYMENT_GUIDE.md) — this is also the TUSDC
 * issuer, so it's the only account that can pay out TUSDC to fund test
 * accounts. A machine-local dependency (like the Postgres integration
 * test depending on a local Postgres server); not committed anywhere.
 */
export function requireDeployerKeypair(): Keypair {
  let secret: string;
  try {
    secret = execSync("stellar keys show workforceos-deployer", { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "This test needs the local `workforceos-deployer` stellar CLI identity " +
        "(the TUSDC issuer) — run `stellar keys generate workforceos-deployer " +
        "--network testnet --fund` or see docs/DEPLOYMENT_GUIDE.md.",
    );
  }
  return Keypair.fromSecret(secret);
}

export async function fundWithFriendbot(publicKey: string): Promise<void> {
  const resp = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(publicKey)}`);
  if (!resp.ok) throw new Error(`Friendbot funding failed for ${publicKey}: ${resp.status}`);
}

async function submitClassic(tx: import("@stellar/stellar-sdk").Transaction): Promise<void> {
  const resp = await fetch(`${HORIZON_URL}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `tx=${encodeURIComponent(tx.toXDR())}`,
  });
  const body = (await resp.json()) as { successful?: boolean; extras?: unknown };
  if (!body.successful) throw new Error(`Horizon submit failed: ${JSON.stringify(body.extras ?? body)}`);
}

/** Establishes a TUSDC trustline for `kp` — required before it can receive TUSDC via deposit/withdraw. */
export async function establishTusdcTrustline(kp: Keypair): Promise<void> {
  const accountData = (await (await fetch(`${HORIZON_URL}/accounts/${kp.publicKey()}`)).json()) as {
    sequence: string;
  };
  const account = new Account(kp.publicKey(), accountData.sequence);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(Operation.changeTrust({ asset: new Asset("TUSDC", TUSDC_ISSUER) }))
    .setTimeout(30)
    .build();
  tx.sign(kp);
  await submitClassic(tx);
}

/** Pays `amount` TUSDC from the issuer to `destinationPublicKey` (destination must already have a trustline). */
export async function payTusdc(destinationPublicKey: string, amount: string): Promise<void> {
  const issuerKp = requireDeployerKeypair();
  const accountData = (await (await fetch(`${HORIZON_URL}/accounts/${issuerKp.publicKey()}`)).json()) as {
    sequence: string;
  };
  const account = new Account(issuerKp.publicKey(), accountData.sequence);
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: config.networkPassphrase })
    .addOperation(Operation.payment({ destination: destinationPublicKey, asset: new Asset("TUSDC", TUSDC_ISSUER), amount }))
    .setTimeout(30)
    .build();
  tx.sign(issuerKp);
  await submitClassic(tx);
}

/**
 * Creates a brand-new organization on the real deployed `payroll_factory`
 * (no dependency on any pre-existing org) and returns its real on-chain
 * addresses, ready to seed into a test `Organization` row.
 */
export async function createTestOrganization(
  ownerKp: Keypair,
): Promise<{ orgId: bigint; organizationAddr: string; treasuryAddr: string }> {
  const factoryClient = await contract.Client.from({
    contractId: PAYROLL_FACTORY,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
    publicKey: ownerKp.publicKey(),
  });

  const salt = Keypair.random().rawPublicKey();
  const createTx = await (
    factoryClient as unknown as {
      create_organization: (
        args: { owner: string; salt: Buffer },
        opts: { publicKey: string },
      ) => Promise<import("@stellar/stellar-sdk").contract.AssembledTransaction<bigint>>;
    }
  ).create_organization({ owner: ownerKp.publicKey(), salt }, { publicKey: ownerKp.publicKey() });

  const sent = await createTx.signAndSend({ signTransaction: async (xdr) => {
    const tx = TransactionBuilder.fromXDR(xdr, config.networkPassphrase);
    tx.sign(ownerKp);
    return { signedTxXdr: tx.toXDR(), signerAddress: ownerKp.publicKey() };
  } });
  const orgId = sent.result;

  const readClient = await contract.Client.from({
    contractId: PAYROLL_FACTORY,
    networkPassphrase: config.networkPassphrase,
    rpcUrl: config.rpcUrl,
  });
  const orgRecordTx = await (
    readClient as unknown as {
      // get_organization returns Result<OrgRecord, WorkforceError> on the
      // Rust side, which decodes to `{ value: OrgRecord }` here, not a
      // flat OrgRecord — confirmed by inspecting the real decoded result.
      get_organization: (args: {
        org_id: bigint;
      }) => Promise<
        import("@stellar/stellar-sdk").contract.AssembledTransaction<{
          value: { organization: string; treasury: string; owner: string };
        }>
      >;
    }
  ).get_organization({ org_id: orgId });

  const record = orgRecordTx.result.value;
  return { orgId, organizationAddr: record.organization, treasuryAddr: record.treasury };
}
