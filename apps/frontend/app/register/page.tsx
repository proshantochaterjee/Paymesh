"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, RegisterInput } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import walletAdapter from "@/lib/wallet";
import { useWalletStore } from "@/lib/store/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setAddress } = useWalletStore();

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = async (data: RegisterInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Registration failed");
      }

      // After successful registration, log them in
      const loginRes = await clientFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!loginRes.ok) {
        throw new Error("Registered successfully, but login failed. Please sign in.");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const available = await walletAdapter.isAvailable();
      if (!available) {
        throw new Error("Freighter wallet is not available. Please install it.");
      }

      const { address } = await walletAdapter.connect();
      
      const challengeRes = await clientFetch("/auth/wallet/challenge", {
        method: "POST",
        body: JSON.stringify({ address }),
      });

      if (!challengeRes.ok) throw new Error("Failed to get auth challenge");

      const { nonce } = await challengeRes.json();
      const { signedMessage } = await walletAdapter.signMessage(`WorkforceOS auth challenge: ${nonce}`, address);

      const verifyRes = await clientFetch("/auth/wallet/verify", {
        method: "POST",
        body: JSON.stringify({ address, signedNonce: signedMessage }),
      });

      if (!verifyRes.ok) throw new Error("Failed to verify wallet signature");

      setAddress(address);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-background p-4">
      <Logo className="text-xl" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Get started with WorkforceOS</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                {...form.register("email")}
                disabled={loading}
              />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                disabled={loading}
              />
              <p className="text-[10px] text-muted-foreground">Minimum 12 characters</p>
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            
            {error && <div className="text-sm text-destructive font-medium">{error}</div>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Register"}
            </Button>
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full" 
            onClick={handleWalletLogin} 
            disabled={loading}
          >
            Sign up with Wallet
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Button variant="link" className="p-0 h-auto" onClick={() => router.push("/login")}>
              Sign in
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
