import { RenameOrgForm } from "@/features/settings/RenameOrgForm";
import { MemberTable } from "@/features/settings/MemberTable";
import { ConnectWalletCard } from "@/features/wallet/ConnectWalletCard";

export default async function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground">Manage organization profile and team access.</p>
      </div>

      <div className="max-w-2xl">
        <RenameOrgForm orgId={orgId} />
      </div>

      <div className="max-w-4xl">
        <MemberTable orgId={orgId} />
      </div>

      <div className="max-w-2xl space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Security</h2>
          <p className="text-muted-foreground text-sm">Your linked Stellar wallet, used to sign on-chain actions.</p>
        </div>
        <ConnectWalletCard />
      </div>
    </div>
  );
}
