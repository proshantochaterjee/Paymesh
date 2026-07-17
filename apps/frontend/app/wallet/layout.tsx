import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stellar Wallet — Freighter Integration",
  description: "Connect Freighter, view your testnet XLM balance, and send payments on Stellar testnet.",
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return children;
}
