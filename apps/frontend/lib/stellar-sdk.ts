import * as StellarSdk from "@stellar/stellar-sdk";
import { HORIZON_TESTNET_URL, STELLAR_TESTNET_PASSPHRASE } from "./stellar-wallet";

const server = new StellarSdk.Horizon.Server(HORIZON_TESTNET_URL);

export async function fetchXlmBalance(address: string): Promise<string> {
  try {
    const account = await server.loadAccount(address);
    const nativeBalance = account.balances.find((b: { asset_type: string }) => b.asset_type === "native");
    return nativeBalance ? nativeBalance.balance : "0";
  } catch (err) {
    if (err && typeof err === "object" && "response" in err) {
      const response = (err as { response?: { status?: number } }).response;
      if (response?.status === 404) {
        return "0";
      }
    }
    throw err;
  }
}

export async function buildPaymentXdr(from: string, to: string, amount: string): Promise<string> {
  const account = await server.loadAccount(from);
  
  // Use a reasonable fee (e.g., 100 stroops). In production, you might want to fetch the current base fee.
  const fee = StellarSdk.BASE_FEE;
  
  const transaction = new StellarSdk.TransactionBuilder(account, {
    fee,
    networkPassphrase: STELLAR_TESTNET_PASSPHRASE,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: to,
        asset: StellarSdk.Asset.native(),
        amount: amount,
      })
    )
    .setTimeout(30)
    .build();

  return transaction.toXDR();
}

export async function submitSignedTx(signedXdr: string): Promise<{ hash: string }> {
  const transaction = StellarSdk.TransactionBuilder.fromXDR(signedXdr, STELLAR_TESTNET_PASSPHRASE);
  const response = await server.submitTransaction(transaction);
  
  if (!response.successful) {
    throw new Error("Transaction failed on Horizon");
  }
  
  return { hash: response.hash };
}
