"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOrganizationSchema, CreateOrganizationInput } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import { throwApiError } from "@/lib/api/errors";
import { useSignAndSubmit } from "@/lib/hooks/useSignAndSubmit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export function CreateOrgForm() {
  const [summary, setSummary] = useState<CreateOrganizationInput | null>(null);

  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: "" },
    mode: "onBlur",
  });

  const { start, SignAndSubmitModal } = useSignAndSubmit({
    title: "Deploy Organization to Blockchain",
    summaryContent: summary && (
      <div className="space-y-2 text-sm">
        <p className="text-muted-foreground mb-4">Creating an organization will deploy its dedicated smart contracts on the Stellar network. You will be prompted to sign the deployment transaction.</p>
        <div className="flex justify-between"><span className="text-muted-foreground">Organization Name:</span> <span className="font-medium">{summary.name}</span></div>
      </div>
    ),
    buildIntent: async () => {
      const res = await clientFetch(`/organizations/create-intent`, {
        method: "POST",
        body: JSON.stringify(summary),
      });

      if (!res.ok) {
        await throwApiError(res, "Failed to prepare organization creation");
      }
      
      const { intentId, unsignedXdr } = await res.json();
      return { intentId, unsignedXdr };
    },
    submitIntent: async (intentId, signedXdr) => {
      const res = await clientFetch(`/organizations/create-intent/${intentId}/submit`, {
        method: "POST",
        body: JSON.stringify({ signedXdr }),
      });
      if (!res.ok) {
        await throwApiError(res, "Failed to submit organization creation");
      }
      return res.json(); // returns created Organization object
    },
    checkStatus: async () => ({ isTerminal: true, success: true }),
    onSuccess: () => {
      // Refresh the page or redirect to dashboard (we don't have the orgId returned smoothly through the hook state yet, 
      // but we can just redirect to / which will pick the first org and redirect to dashboard)
      window.location.href = "/";
    }
  });

  const onSubmit = (data: CreateOrganizationInput) => {
    setSummary(data);
    start();
  };

  return (
    <>
      <Card className="w-full max-w-md mx-auto shadow-lg border-primary/20">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-2">
            <Building2 className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Create Organization</CardTitle>
          <CardDescription>Deploy your organization&apos;s smart contracts to start managing treasury and payroll on-chain.</CardDescription>
        </CardHeader>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Organization Name</Label>
              <Input id="name" placeholder="Acme DAO" {...form.register("name")} />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full text-lg h-12">Deploy Organization</Button>
          </CardFooter>
        </form>
      </Card>
      <SignAndSubmitModal />
    </>
  );
}
