import { useState, useEffect, useCallback } from "react";
import { detectFreighter, connectWallet, getWalletAddress, signTx } from "@/lib/stellar-wallet";
import { fetchXlmBalance, buildPaymentXdr, submitSignedTx } from "@/lib/stellar-sdk";

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async (walletAddress: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const bal = await fetchXlmBalance(walletAddress);
      setBalance(bal);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to fetch balance"));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    async function checkExistingConnection() {
      try {
        const hasFreighter = await detectFreighter();
        if (hasFreighter) {
          const existingAddress = await getWalletAddress();
          if (existingAddress) {
            setAddress(existingAddress);
            setIsConnected(true);
            await refreshBalance(existingAddress);
          }
        }
      } catch (err) {
        // Silently ignore if we just haven't connected yet
      }
    }
    checkExistingConnection();
  }, [refreshBalance]);

  const connect = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const hasFreighter = await detectFreighter();
      if (!hasFreighter) {
        throw new Error("Freighter not detected");
      }
      const newAddress = await connectWallet();
      setAddress(newAddress);
      setIsConnected(true);
      await refreshBalance(newAddress);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to connect wallet"));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = () => {
    setAddress(null);
    setBalance(null);
    setIsConnected(false);
    setError(null);
  };

  const sendXlm = async (to: string, amount: string): Promise<{ hash: string }> => {
    if (!address) throw new Error("Wallet not connected");
    setIsLoading(true);
    setError(null);
    try {
      const xdr = await buildPaymentXdr(address, to, amount);
      const signedXdr = await signTx(xdr);
      const result = await submitSignedTx(signedXdr);
      await refreshBalance(address);
      return result;
    } catch (err) {
      setError(getErrorMessage(err, "Transaction failed"));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    address,
    balance,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
    refreshBalance: () => {
      if (address) refreshBalance(address);
    },
    sendXlm,
  };
}
