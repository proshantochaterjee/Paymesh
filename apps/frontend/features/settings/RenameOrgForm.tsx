"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateOrganizationSchema, UpdateOrganizationInput } from "@workforceos/shared";
import { useOrganization } from "./queries";
import { clientFetch } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { useQueryClient } from "@tanstack/react-query";
import { useMyRole } from "@/lib/hooks/useMyRole";

export function RenameOrgForm({ orgId }: { orgId: string }) {
  const { data: org } = useOrganization(orgId);
  // docs/PERMISSION_MODEL.md: renaming an org needs ADMIN — disabled here
  // for UX only, the backend's own @MinRole guard is the real boundary.
  const { can } = useMyRole(orgId);
  const canRename = can("ADMIN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const queryClient = useQueryClient();

  const form = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: { name: org?.name || "" },
    mode: "onBlur",
  });

  // Update default value if org loads after initial render
  if (org && form.getValues("name") === "" && !form.formState.isDirty) {
    form.setValue("name", org.name);
  }

  const onSubmit = async (data: UpdateOrganizationInput) => {
    if (data.name === org?.name) return;

    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await clientFetch(`/organizations/${orgId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "Failed to rename organization");
      }

      queryClient.invalidateQueries({ queryKey: ["org", orgId] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Organization Details</CardTitle>
        <CardDescription>Update your organization&apos;s display name.</CardDescription>
      </CardHeader>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2 max-w-sm">
            <Label htmlFor="name">Organization Name</Label>
            <Input id="name" {...form.register("name")} disabled={loading || !canRename} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {success && <p className="text-sm text-success">Organization updated successfully.</p>}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={loading || !form.formState.isDirty || !canRename}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
