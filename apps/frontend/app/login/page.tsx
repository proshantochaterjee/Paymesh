"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, LoginInput } from "@workforceos/shared";
import { clientFetch } from "@/lib/api/client";
import walletAdapter from "@/lib/wallet";
import { useWalletStore } from "@/lib/store/wallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setAddress } = useWalletStore();

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = async (data: LoginInput) => {
    setLoading(true);
    setError(null);
    try {
      const res = await clientFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "Login failed");
      }

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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

      if (!challengeRes.ok) {
        throw new Error("Failed to get auth challenge");
      }

      const { nonce } = await challengeRes.json();
      
      const { signedMessage } = await walletAdapter.signMessage(`WorkforceOS auth challenge: ${nonce}`, address);

      const verifyRes = await clientFetch("/auth/wallet/verify", {
        method: "POST",
        body: JSON.stringify({ address, signedNonce: signedMessage }),
      });

      if (!verifyRes.ok) {
        throw new Error("Failed to verify wallet signature");
      }

      setAddress(address);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-8 bg-background p-4">
      <Logo className="text-xl" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to your WorkforceOS account</CardDescription>
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
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            
            {error && <div className="text-sm text-destructive font-medium">{error}</div>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
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
            Sign in with Wallet
          </Button>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Button variant="link" className="p-0 h-auto" onClick={() => router.push("/register")}>
              Register
            </Button>
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
