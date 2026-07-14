import { DashboardOverview } from "@/features/dashboard/DashboardOverview";

export default async function DashboardPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;

  return <DashboardOverview orgId={orgId} />;
}
