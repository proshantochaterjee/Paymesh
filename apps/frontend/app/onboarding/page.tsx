"use client";

import { CreateOrgForm } from "@/features/onboarding/CreateOrgForm";
import { ConnectWalletCard } from "@/features/wallet/ConnectWalletCard";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { Logo } from "@/components/Logo";

export default function OnboardingPage() {
  const { data: currentUser, isLoading } = useCurrentUser();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center mb-3">
          <Logo className="text-2xl" iconClassName="h-7 w-7" />
        </div>
        <p className="text-muted-foreground text-sm max-w-sm mx-auto">
          Welcome to WorkforceOS — a programmable workforce-finance platform for crypto-native payroll and treasuries.
        </p>
      </div>

      {/* Creating an org signs a real Stellar transaction (owner.require_auth()) —
          a wallet must be linked before that form is usable at all. */}
      {!isLoading && !currentUser?.primaryWallet ? (
        <div className="w-full max-w-md mx-auto">
          <ConnectWalletCard />
        </div>
      ) : (
        <CreateOrgForm />
      )}
    </div>
  );
}
