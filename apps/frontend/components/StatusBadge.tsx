import { Badge } from "@/components/ui/badge";

export type DomainStatus = 
  | "COMPLETED" | "RELEASED" | "CONFIRMED" 
  | "PARTIAL" | "PENDING" | "SCHEDULED" 
  | "FAILED" | "CANCELLED" 
  | "SUBMITTED" | "EXECUTING" | "FUNDED" 
  | "DRAFT" | "INACTIVE"
  | string;

export function StatusBadge({ status }: { status: DomainStatus }) {
  const normalized = status.toUpperCase();
  
  if (["COMPLETED", "RELEASED", "CONFIRMED"].includes(normalized)) {
    return <Badge className="bg-success text-success-foreground hover:bg-success/80">{status}</Badge>;
  }
  if (["PARTIAL", "PENDING", "SCHEDULED"].includes(normalized)) {
    return <Badge className="bg-warning text-warning-foreground hover:bg-warning/80">{status}</Badge>;
  }
  if (["FAILED", "CANCELLED"].includes(normalized)) {
    return <Badge variant="destructive">{status}</Badge>;
  }
  if (["SUBMITTED", "EXECUTING", "FUNDED"].includes(normalized)) {
    return <Badge className="bg-info text-info-foreground hover:bg-info/80">{status}</Badge>;
  }
  
  // DRAFT, INACTIVE, etc.
  return <Badge variant="secondary" className="text-muted-foreground">{status}</Badge>;
}
