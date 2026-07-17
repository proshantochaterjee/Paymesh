"use client";

import React, { useEffect, useState } from "react";
// Imported directly per Level 1 spec, even though `useWallet` wraps these calls internally.
import { detectFreighter, connectWallet, signTx } from "@/lib/stellar-wallet"; // eslint-disable-line @typescript-eslint/no-unused-vars
import { useWallet } from "@/lib/hooks/use-stellar-wallet";

export function StellarWalletPanel() {
  const {
    address,
    balance,
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
    refreshBalance,
    sendXlm,
  } = useWallet();

  const [hasFreighter, setHasFreighter] = useState<boolean | null>(null);
  const [destination, setDestination] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);

  useEffect(() => {
    async function checkFreighter() {
      const detected = await detectFreighter();
      setHasFreighter(detected);
    }
    checkFreighter();
  }, []);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxHash(null);
    try {
      const result = await sendXlm(destination, amount);
      setTxHash(result.hash);
      setDestination("");
      setAmount("");
    } catch {
      // Error is handled by the hook and displayed below
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-white rounded-xl shadow-lg border border-gray-100">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Stellar Wallet</h2>

      {hasFreighter === false && (
        <div className="mb-4 p-4 bg-yellow-50 text-yellow-800 rounded-lg">
          <p>
            Freighter extension not detected.{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold underline"
            >
              Install Freighter
            </a>
          </p>
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {txHash && (
        <div className="mb-4 p-4 bg-green-50 text-green-700 rounded-lg border border-green-200">
          <p className="font-semibold">Transaction sent!</p>
          <p className="text-sm">
            Hash: {txHash}
          </p>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold underline mt-2 inline-block"
          >
            View on Stellar Expert
          </a>
        </div>
      )}

      {!isConnected ? (
        <button
          onClick={connect}
          disabled={isLoading || hasFreighter === false}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
        >
          {isLoading ? "Connecting..." : "Connect Wallet"}
        </button>
      ) : (
        <div className="space-y-6">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500 font-medium">Connected Address</span>
              <button
                onClick={disconnect}
                className="text-sm text-red-600 hover:text-red-700 font-semibold"
              >
                Disconnect
              </button>
            </div>
            <p className="font-mono text-sm break-all">{address}</p>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500 font-medium">Balance</span>
              <button
                onClick={refreshBalance}
                disabled={isLoading}
                className="text-sm text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              {balance ? `${balance} XLM` : "0 XLM (account not funded)"}
            </p>
          </div>

          <form onSubmit={handleSend} className="space-y-4 pt-4 border-t border-gray-200">
            <h3 className="text-lg font-semibold text-gray-800">Send XLM</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destination Address
              </label>
              <input
                type="text"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="G..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount (XLM)
              </label>
              <input
                type="number"
                step="0.0000001"
                min="0.0000001"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={isLoading || !destination || !amount}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? "Processing..." : "Send XLM"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
