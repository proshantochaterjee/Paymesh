import { EmployeeTable } from "@/features/employees/EmployeeTable";
import { InviteEmployeeDialog } from "@/features/employees/InviteEmployeeDialog";

export default async function EmployeesPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-muted-foreground">Manage your team members and their compensation.</p>
        </div>
        <InviteEmployeeDialog orgId={orgId} />
      </div>

      <EmployeeTable orgId={orgId} />
    </div>
  );
}
