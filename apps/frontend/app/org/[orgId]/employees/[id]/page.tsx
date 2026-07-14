import { EmployeeDetail } from "@/features/employees/EmployeeDetail";

export default async function EmployeeDetailPage({ 
  params 
}: { 
  params: Promise<{ orgId: string; id: string }> 
}) {
  const { orgId, id } = await params;
  
  return <EmployeeDetail orgId={orgId} employeeId={id} />;
}
