"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import walletAdapter from "@/lib/wallet";
import { useWalletStore } from "@/lib/store/wallet";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, CheckCircle2 } from "lucide-react";

/**
 * `POST /auth/wallet/link` — links a Stellar wallet to the *current
 * session's* user (docs/AUTHENTICATION.md §3), distinct from
 * `/auth/wallet/verify` (login/register pages use that one to create a
 * session from a wallet signature, not to link one to an existing
 * email/password session).
 *
 * This exists because an email/password-registered user otherwise has no
 * way to acquire a linked wallet at all: creating an organization needs
 * `owner.require_auth()` (a real wallet signature), but the only other
 * wallet-link surface (Settings' Security tab) lives under
 * `/org/[orgId]/settings`, which requires an org to already exist —
 * without this component surfaced during onboarding, that's a genuine
 * deadlock, found by actually driving the onboarding flow in a browser.
 */
export function ConnectWalletCard({ onLinked }: { onLinked?: () => void }) {
  const { data: currentUser, isLoading } = useCurrentUser();
  const { setAddress } = useWalletStore();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const available = await walletAdapter.isAvailable();
      if (!available) {
        throw new Error("Freighter wallet extension not found. Please install it to continue.");
      }

      const { address } = await walletAdapter.connect();

      const challengeRes = await clientFetch("/auth/wallet/challenge", {
        method: "POST",
        body: JSON.stringify({ address }),
      });
      if (!challengeRes.ok) await throwApiError(challengeRes, "Failed to get wallet challenge");
      const { nonce } = await challengeRes.json();

      const { signedMessage } = await walletAdapter.signMessage(`WorkforceOS auth challenge: ${nonce}`, address);

      const linkRes = await clientFetch("/auth/wallet/link", {
        method: "POST",
        body: JSON.stringify({ address, signedNonce: signedMessage }),
      });
      if (!linkRes.ok) await throwApiError(linkRes, "Failed to link wallet");

      setAddress(address);
      await queryClient.invalidateQueries({ queryKey: ["auth", "session"] });
      onLinked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  };

  if (isLoading) return null;

  if (currentUser?.primaryWallet) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-4">
          <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
          <div className="text-sm">
            <span className="text-muted-foreground">Wallet connected: </span>
            <span className="font-mono">{currentUser.primaryWallet.slice(0, 4)}...{currentUser.primaryWallet.slice(-4)}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="text-center space-y-4">
        <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center">
          <Wallet className="h-8 w-8 text-primary" />
        </div>
        <CardTitle>Connect Your Wallet</CardTitle>
        <CardDescription>
          On-chain actions (like deploying an organization) require a signature from your own Stellar wallet.
          Connect Freighter to continue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <Button className="w-full h-12 text-lg" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Connecting..." : "Connect Wallet"}
        </Button>
      </CardContent>
    </Card>
  );
}
