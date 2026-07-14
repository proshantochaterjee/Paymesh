import { ContractorDetail } from "@/features/contractors/ContractorDetail";

export default async function ContractorDetailPage({ 
  params 
}: { 
  params: Promise<{ orgId: string; id: string }> 
}) {
  const { orgId, id } = await params;
  
  return <ContractorDetail orgId={orgId} contractorId={id} />;
}
