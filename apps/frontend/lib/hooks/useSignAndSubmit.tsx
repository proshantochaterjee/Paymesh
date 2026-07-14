"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import walletAdapter from "@/lib/wallet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type SignAndSubmitState = "idle" | "review" | "wallet" | "submitting" | "confirming" | "done" | "error";

interface SignAndSubmitConfig {
  buildIntent: () => Promise<{ intentId: string; unsignedXdr: string; isLastChunk?: boolean; step?: string } | null>;
  submitIntent: (intentId: string, signedXdr: string) => Promise<unknown>;
  checkStatus?: () => Promise<{ isTerminal: boolean; success: boolean; error?: string }>;
  queryKeysToInvalidate?: unknown[][];
  summaryContent: React.ReactNode;
  title?: string;
  onSuccess?: () => void;
}

export function useSignAndSubmit(config: SignAndSubmitConfig) {
  const [state, setState] = useState<SignAndSubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ current: number; total?: number } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const start = () => {
    setState("review");
    setErrorMsg(null);
    setChunkProgress(null);
    setIsOpen(true);
  };

  const close = () => {
    if (state !== "wallet" && state !== "submitting" && state !== "confirming") {
      setIsOpen(false);
      setTimeout(() => setState("idle"), 200);
    }
  };

  const formatError = (err: unknown) => {
    // `code` is the backend's stable, machine-matchable `error` field
    // (apps/backend/.../domain.exception.ts) — matching on it, not the
    // human-readable `message` (which never actually contains these
    // literal code strings), is what makes these branches reachable at all.
    const error = err as Error & { code?: string; details?: { shortfall?: string } };
    switch (error?.code) {
      case "INTENT_EXPIRED":
        return "The transaction intent has expired. Please try again.";
      case "INTENT_ALREADY_SUBMITTED":
        return "This transaction has already been submitted.";
      case "SIMULATION_FAILED":
        return "Transaction simulation failed. Please check inputs and balance.";
      case "CHAIN_SUBMISSION_FAILED":
        return "Transaction failed to submit to the Stellar network.";
      case "INSUFFICIENT_TREASURY_BALANCE":
        return `Insufficient treasury balance. Shortfall: ${error?.details?.shortfall || "unknown"}`;
      case "INVALID_STATE_TRANSITION":
        return error.message || "This action isn't valid in the current state.";
      default:
        return error?.message || "An unexpected error occurred.";
    }
  };

  const executeFlow = async () => {
    try {
      setErrorMsg(null);
      let isDone = false;
      let chunksProcessed = 0;

      while (!isDone) {
        setState("submitting"); // Or 'building intent' if we had such state, we use submitting for both
        const intentResult = await config.buildIntent();
        
        if (!intentResult) {
          // If null, it means there's no intent to build (e.g. Postgres-only step complete)
          isDone = true;
          break;
        }

        const { intentId, unsignedXdr, isLastChunk, step } = intentResult;
        
        setState("wallet");
        const { address } = await walletAdapter.connect();
        const { signedTxXdr } = await walletAdapter.signTransaction(unsignedXdr, address);

        setState("submitting");
        await config.submitIntent(intentId, signedTxXdr);

        if (config.checkStatus) {
          setState("confirming");
          let terminal = false;
          // 2s interval, capped at 60 attempts (~2 minutes) — a stuck
          // confirmation must surface as an error, never spin forever.
          for (let attempt = 0; !terminal && attempt < 60; attempt++) {
            await new Promise(r => setTimeout(r, 2000));
            const status = await config.checkStatus();
            terminal = status.isTerminal;
            if (terminal && !status.success) {
              throw new Error(status.error || "Transaction failed on-chain.");
            }
          }
          if (!terminal) {
            throw new Error("Timed out waiting for on-chain confirmation. Check the transaction history — it may still complete.");
          }
        }

        chunksProcessed++;
        if (isLastChunk === false || step === "create") {
           // Continue looping
           setChunkProgress({ current: chunksProcessed });
        } else {
           isDone = true;
        }
      }

      setState("done");
      if (config.queryKeysToInvalidate) {
        config.queryKeysToInvalidate.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
      }
      if (config.onSuccess) config.onSuccess();
      
    } catch (err: unknown) {
      const error = err as Error & { name?: string };
      if (error.name === "FreighterError" || error.message?.includes("User declined")) {
        setErrorMsg("Wallet signature was rejected by the user.");
        setState("error");
      } else {
        setErrorMsg(formatError(err));
        setState("error");
      }
    }
  };

  const renderStateContent = () => {
    switch (state) {
      case "review":
        return (
          <>
            <div className="py-4">{config.summaryContent}</div>
            <DialogFooter>
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={executeFlow}>Confirm & Sign</Button>
            </DialogFooter>
          </>
        );
      case "wallet":
        return (
          <div className="py-8 text-center text-muted-foreground flex flex-col items-center">
            <span className="mb-4">Please sign the transaction in your wallet extension...</span>
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        );
      case "submitting":
        return (
          <div className="py-8 text-center text-muted-foreground flex flex-col items-center">
            <span className="mb-4">
              {chunkProgress ? `Processing batch ${chunkProgress.current + 1}...` : "Submitting transaction..."}
            </span>
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        );
      case "confirming":
        return (
          <div className="py-8 text-center text-muted-foreground flex flex-col items-center">
            <span className="mb-4">Waiting for on-chain confirmation...</span>
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        );
      case "done":
        return (
          <div className="py-8 text-center flex flex-col items-center">
            <div className="text-success mb-2">
              <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-foreground font-medium">Transaction Complete</span>
            <div className="mt-6">
              <Button onClick={close}>Close</Button>
            </div>
          </div>
        );
      case "error":
        return (
          <div className="py-8 text-center flex flex-col items-center">
            <div className="text-destructive mb-2">
              <svg className="w-10 h-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <span className="text-destructive font-medium max-w-sm">{errorMsg}</span>
            <div className="mt-6 space-x-2">
              <Button variant="outline" onClick={close}>Cancel</Button>
              <Button onClick={executeFlow}>Retry</Button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const SignAndSubmitModal = () => (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md" >
        <DialogHeader>
          <DialogTitle>{config.title || "Confirm Transaction"}</DialogTitle>
          {(state === "review" || state === "error") && (
             <DialogDescription>
               Please review the transaction details before signing.
             </DialogDescription>
          )}
        </DialogHeader>
        {renderStateContent()}
      </DialogContent>
    </Dialog>
  );

  return { start, SignAndSubmitModal };
}
