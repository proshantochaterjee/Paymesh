import { isConnected, isAllowed, requestAccess, getAddress, signTransaction } from "@stellar/freighter-api";

export const STELLAR_TESTNET_PASSPHRASE = "Test SDF Network ; September 2015";
export const HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";

export async function detectFreighter(): Promise<boolean> {
  const result = await isConnected();
  return result.isConnected;
}

export async function connectWallet(): Promise<string> {
  let allowedResult = await isAllowed();
  if (!allowedResult.isAllowed) {
    await requestAccess();
    allowedResult = await isAllowed();
    if (!allowedResult.isAllowed) {
      throw new Error("User declined Freighter access");
    }
  }
  const addressResult = await getAddress();
  if (addressResult.error) {
    throw new Error(addressResult.error);
  }
  if (!addressResult.address) {
    throw new Error("Could not retrieve address from Freighter");
  }
  return addressResult.address;
}

export async function getWalletAddress(): Promise<string | null> {
  const allowedResult = await isAllowed();
  if (allowedResult.isAllowed) {
    const addressResult = await getAddress();
    return addressResult.address || null;
  }
  return null;
}

export async function signTx(xdr: string): Promise<string> {
  const result = await signTransaction(xdr, { networkPassphrase: STELLAR_TESTNET_PASSPHRASE });
  if (result.error) {
    throw new Error(result.error);
  }
  return result.signedTxXdr;
}
