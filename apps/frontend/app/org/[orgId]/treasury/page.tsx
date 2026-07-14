import { TreasuryDashboard } from "@/features/treasury/TreasuryDashboard";

export default async function TreasuryPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return <TreasuryDashboard orgId={orgId} />;
}
