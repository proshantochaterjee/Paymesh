import { MilestoneDetail } from "@/features/milestones/MilestoneDetail";

export default async function MilestoneDetailPage({ 
  params 
}: { 
  params: Promise<{ orgId: string; id: string }> 
}) {
  const { orgId, id } = await params;
  
  return <MilestoneDetail orgId={orgId} milestoneId={id} />;
}
