"use client";

import React from "react";
import { StellarWalletPanel } from "@/components/wallet/stellar-wallet-panel";

export default function WalletPage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-gray-900 mb-4">
            Stellar Wallet — Freighter Integration
          </h1>
          <p className="text-lg text-gray-600">
            Connect your Freighter wallet, view your XLM balance, and send testnet payments.
          </p>
        </div>
        
        <StellarWalletPanel />
      </div>
    </main>
  );
}
