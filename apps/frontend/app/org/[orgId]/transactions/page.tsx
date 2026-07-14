import { TransactionTable } from "@/features/transactions/TransactionTable";

export default async function TransactionsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        <p className="text-muted-foreground">Comprehensive history of all on-chain treasury activity.</p>
      </div>

      <TransactionTable orgId={orgId} />
    </div>
  );
}
