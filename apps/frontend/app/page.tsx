"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clientFetch } from "@/lib/api/client";
import { useCurrentUser } from "@/lib/hooks/useCurrentUser";
import { useUiStore } from "@/lib/store/ui";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wallet, Users, Map, ShieldCheck, ArrowRight, LineChart, Banknote,
} from "lucide-react";

const FEATURES = [
  {
    icon: Wallet,
    title: "Non-custodial treasury",
    description: "Deposit and hold USDC on Stellar. Every disbursement is a signed transaction from your own wallet — we never hold a key.",
  },
  {
    icon: Banknote,
    title: "Batched payroll runs",
    description: "Preview cost against your treasury balance, then execute payroll as a single authorized on-chain operation set, with per-employee status.",
  },
  {
    icon: Map,
    title: "Contractor milestones",
    description: "Fund a milestone into escrow, approve the work, release payment — a visible, auditable state machine for every contractor engagement.",
  },
  {
    icon: LineChart,
    title: "Real-time analytics",
    description: "Payroll cost trends, department spend, treasury inflow/outflow — all backed by an event indexer reading directly from Stellar RPC.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based permissions",
    description: "Owner, Admin, Finance, HR, and Viewer roles enforced at the API and contract layer, not just hidden in the UI.",
  },
  {
    icon: Users,
    title: "Employee & contractor registry",
    description: "CRUD records with CSV bulk import, dry-run validation, and two-phase on-chain registration you can retry if it fails.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo />
          <nav className="flex items-center gap-2">
            <Button variant="ghost" render={<Link href="/login" />} nativeButton={false}>
              Sign in
            </Button>
            <Button render={<Link href="/register" />} nativeButton={false}>
              Get started <ArrowRight className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-16 text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Settled on Stellar Testnet via Soroban smart contracts
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Payroll and contractor payments, verifiable on-chain.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            WorkforceOS gives crypto-native and remote-first organizations one workspace to run payroll,
            pay contractor milestones, and manage treasury — without ever handing custody of funds to a third party.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button size="lg" className="h-11 px-6 text-base" render={<Link href="/register" />} nativeButton={false}>
              Create an organization <ArrowRight className="h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline" className="h-11 px-6 text-base" render={<Link href="/login" />} nativeButton={false}>
              Sign in
            </Button>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardContent className="pt-1">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15">
                    <feature.icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <h3 className="font-medium text-foreground">{feature.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8">
        <div className="mx-auto max-w-6xl px-6 text-sm text-muted-foreground">
          WorkforceOS — a programmable workforce-finance platform on Stellar.
        </div>
      </footer>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { data: currentUser, isLoading } = useCurrentUser();
  const lastOrgId = useUiStore((state) => state.lastOrgId);
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isLoading || hasRedirected.current) return;
    if (!currentUser) return; // stay on the landing page for logged-out visitors

    async function redirect() {
      if (lastOrgId) {
        router.replace(`/org/${lastOrgId}/dashboard`);
        return;
      }

      // No cached org yet (first login on this device, or cache cleared) —
      // check whether the user already belongs to any org before assuming
      // they need onboarding.
      try {
        const res = await clientFetch("/organizations");
        const orgs = res.ok ? await res.json() : [];
        if (Array.isArray(orgs) && orgs.length > 0) {
          router.replace(`/org/${orgs[0].id}/dashboard`);
          return;
        }
      } catch {
        // Fall through to onboarding — an org-list fetch failure shouldn't
        // strand an authenticated user on a blank loading screen.
      }
      router.replace("/onboarding");
    }

    hasRedirected.current = true;
    void redirect();
  }, [isLoading, currentUser, lastOrgId, router]);

  if (isLoading || currentUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <LandingPage />;
}
