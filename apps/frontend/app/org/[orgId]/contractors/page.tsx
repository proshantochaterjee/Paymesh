import { ContractorTable } from "@/features/contractors/ContractorTable";
import { InviteContractorDialog } from "@/features/contractors/InviteContractorDialog";

export default async function ContractorsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Contractors</h1>
          <p className="text-muted-foreground">Manage external contractors and their payment details.</p>
        </div>
        <InviteContractorDialog orgId={orgId} />
      </div>

      <ContractorTable orgId={orgId} />
    </div>
  );
}
