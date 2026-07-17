import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSignAndSubmit } from "./useSignAndSubmit";
import walletAdapter from "@/lib/wallet";

vi.mock("@/lib/wallet", () => ({
  default: {
    connect: vi.fn(),
    signTransaction: vi.fn(),
  },
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function Harness(config: Parameters<typeof useSignAndSubmit>[0]) {
  const { start, SignAndSubmitModal } = useSignAndSubmit(config);
  return (
    <>
      <button onClick={start}>Open</button>
      <SignAndSubmitModal />
    </>
  );
}

describe("useSignAndSubmit", () => {
  it("walks review -> wallet -> submit -> done on the happy path", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    vi.mocked(walletAdapter.connect).mockResolvedValue({ address: "GABC" });
    vi.mocked(walletAdapter.signTransaction).mockResolvedValue({ signedTxXdr: "signed", signerAddress: "GABC" });

    renderWithClient(
      <Harness
        buildIntent={async () => ({ intentId: "intent-1", unsignedXdr: "xdr" })}
        submitIntent={vi.fn().mockResolvedValue({ ok: true })}
        summaryContent={<div>Review this</div>}
      />,
    );

    await user.click(screen.getByText("Open"));
    expect(screen.getByText("Review this")).toBeInTheDocument();

    await user.click(screen.getByText("Confirm & Sign"));

    await waitFor(() => expect(screen.getByText("Transaction Complete")).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled(); // not passed in this case, ensures no crash
    expect(walletAdapter.connect).toHaveBeenCalled();
    expect(walletAdapter.signTransaction).toHaveBeenCalledWith("xdr", "GABC");
  });

  it("surfaces a stable backend error code as a friendly message, and allows retry", async () => {
    const user = userEvent.setup();
    vi.mocked(walletAdapter.connect).mockResolvedValue({ address: "GABC" });
    vi.mocked(walletAdapter.signTransaction).mockResolvedValue({ signedTxXdr: "signed", signerAddress: "GABC" });

    let attempt = 0;
    const submitIntent = vi.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) {
        const err = new Error("Simulation failed") as Error & { code?: string };
        err.code = "SIMULATION_FAILED";
        return Promise.reject(err);
      }
      return Promise.resolve({ ok: true });
    });

    renderWithClient(
      <Harness
        buildIntent={async () => ({ intentId: "intent-1", unsignedXdr: "xdr" })}
        submitIntent={submitIntent}
        summaryContent={<div>Review this</div>}
      />,
    );

    await user.click(screen.getByText("Open"));
    await user.click(screen.getByText("Confirm & Sign"));

    await waitFor(() =>
      expect(screen.getByText("Transaction simulation failed. Please check inputs and balance.")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Retry"));
    await waitFor(() => expect(screen.getByText("Transaction Complete")).toBeInTheDocument());
    expect(submitIntent).toHaveBeenCalledTimes(2);
  });

  it("treats a wallet rejection as a distinct, user-actionable error", async () => {
    const user = userEvent.setup();
    vi.mocked(walletAdapter.connect).mockResolvedValue({ address: "GABC" });
    vi.mocked(walletAdapter.signTransaction).mockRejectedValue(new Error("User declined access"));

    renderWithClient(
      <Harness
        buildIntent={async () => ({ intentId: "intent-1", unsignedXdr: "xdr" })}
        submitIntent={vi.fn()}
        summaryContent={<div>Review this</div>}
      />,
    );

    await user.click(screen.getByText("Open"));
    await user.click(screen.getByText("Confirm & Sign"));

    await waitFor(() =>
      expect(screen.getByText("Wallet signature was rejected by the user.")).toBeInTheDocument(),
    );
  });
});
