import { redirect } from "next/navigation";
import { serverFetch } from "@/lib/api/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { StoreInitializer } from "@/components/layout/StoreInitializer";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;

  // Verify server-side that caller is a member of orgId
  const res = await serverFetch(`/organizations/${orgId}`);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      redirect("/login");
    } else {
      // Potentially 404
      redirect("/login");
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      <StoreInitializer orgId={orgId} />
      <Sidebar orgId={orgId} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar orgId={orgId} />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-[1440px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
