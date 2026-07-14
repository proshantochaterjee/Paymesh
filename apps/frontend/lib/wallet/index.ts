import {
  isFreighterAvailable,
  connectFreighter,
  signMessageWithFreighter,
  signTransactionWithFreighter,
} from "@workforceos/sdk";

export interface WalletAdapter {
  isAvailable(): Promise<boolean>;
  connect(): Promise<{ address: string }>;
  signMessage(message: string, address?: string): Promise<{ signedMessage: string; signerAddress: string }>;
  signTransaction(xdr: string, address?: string): Promise<{ signedTxXdr: string; signerAddress: string }>;
}

export const freighterAdapter: WalletAdapter = {
  isAvailable: isFreighterAvailable,
  connect: connectFreighter,
  signMessage: (message, address) => signMessageWithFreighter(message, { address }),
  signTransaction: (xdr, address) => signTransactionWithFreighter(xdr, { address }),
};

// Default export uses Freighter for MVP
export default freighterAdapter;
