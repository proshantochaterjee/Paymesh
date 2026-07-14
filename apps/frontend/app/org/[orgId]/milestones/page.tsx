import { MilestoneTable } from "@/features/milestones/MilestoneTable";
import { CreateMilestoneDialog } from "@/features/milestones/CreateMilestoneDialog";

export default async function MilestonesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Milestones</h1>
          <p className="text-muted-foreground">Manage and fund contractor milestones on-chain.</p>
        </div>
        <CreateMilestoneDialog orgId={orgId} />
      </div>

      <MilestoneTable orgId={orgId} />
    </div>
  );
}
