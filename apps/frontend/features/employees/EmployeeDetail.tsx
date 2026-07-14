"use client";

import { useEmployee } from "./queries";
import { UpdateSalaryDialog } from "./UpdateSalaryDialog";
import { StatusBadge, DomainStatus } from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, User, Briefcase, Mail, Wallet, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function EmployeeDetail({ orgId, employeeId }: { orgId: string; employeeId: string }) {
  const { data: employee, isLoading, isError, refetch } = useEmployee(orgId, employeeId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-full max-w-sm" />
            <Skeleton className="h-4 w-full max-w-xs" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !employee) {
    return (
      <div className="space-y-6">
        <Link href={`/org/${orgId}/employees`} className="flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Employees
        </Link>
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex flex-col items-center py-6 text-center">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <p className="text-destructive font-medium mb-4">Failed to load employee details</p>
            <Button variant="outline" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/org/${orgId}/employees`} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Employees
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="bg-primary/10 p-3 rounded-full">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{employee.fullName}</h1>
              <div className="flex items-center mt-1 space-x-3 text-sm text-muted-foreground">
                <span className="flex items-center"><Mail className="mr-1 h-3 w-3" /> {employee.email}</span>
                <StatusBadge status={employee.status as DomainStatus} />
              </div>
            </div>
          </div>
          <UpdateSalaryDialog orgId={orgId} employee={employee} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Briefcase className="mr-2 h-5 w-5 text-muted-foreground" />
              Employment Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Status</div>
              <div className="font-medium">{employee.status}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Department</div>
              <div className="font-medium">{employee.departmentId || "Unassigned"}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">On-Chain ID</div>
              <div className="font-mono text-sm">{employee.onChainEmployeeId || "Not Registered"}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center">
              <Banknote className="mr-2 h-5 w-5 text-muted-foreground" />
              Compensation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Salary</div>
              <div className="font-medium font-variant-numeric tabular-nums text-xl">
                {Number(employee.salaryAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {employee.salaryCurrency}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Pay Frequency</div>
              <div className="font-medium capitalize">{employee.payFrequency.toLowerCase()}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Wallet Address</div>
              <div className="font-mono text-sm break-all flex items-center">
                <Wallet className="mr-2 h-4 w-4 text-muted-foreground" />
                {employee.walletAddress}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
