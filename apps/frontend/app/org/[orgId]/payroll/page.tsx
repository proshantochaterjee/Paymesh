import { PayrollDashboard } from "@/features/payroll/PayrollDashboard";

export default async function PayrollPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  
  return <PayrollDashboard orgId={orgId} />;
}
