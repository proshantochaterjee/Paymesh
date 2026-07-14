// Named imports from this package don't survive Node's strict CJS/ESM
// interop for its minified UMD bundle (works under Vitest/Vite's more
// lenient transform, breaks under plain `node dist/...` — caught by
// actually booting the compiled app, not just typechecking it). Import
// the default export only and destructure at runtime instead.
import freighterApi from "@stellar/freighter-api";

const freighterIsConnected = freighterApi.isConnected;

/**
 * Thin wrapper over `@stellar/freighter-api` (docs/BLOCKCHAIN_ARCHITECTURE.md
 * §5, §7: the wallet signs client-side, the private key never leaves the
 * extension). Two normalizations beyond a bare re-export, both load-bearing:
 * - `@stellar/freighter-api` returns `{ error }` rather than throwing;
 *   normalized here to a thrown `Error` so callers use ordinary
 *   try/catch, consistent with the rest of the codebase.
 * - `signMessage`'s `signedMessage` is a `Buffer` on older extension
 *   versions and a base64 `string` on newer ones — normalized to always
 *   return a base64 string, matching what the backend's
 *   `/auth/wallet/verify` expects (docs/API_SPECIFICATION.md).
 */
class FreighterError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "FreighterError";
  }
}

export async function isFreighterAvailable(): Promise<boolean> {
  const result = await freighterIsConnected();
  return result.error === undefined && result.isConnected;
}

export async function connectFreighter(): Promise<{ address: string }> {
  const result = await freighterApi.requestAccess();
  if (result.error) throw new FreighterError(result.error.message, result.error.code);
  return { address: result.address };
}

export async function signMessageWithFreighter(
  message: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedMessage: string; signerAddress: string }> {
  const result = await freighterApi.signMessage(message, opts);
  if (result.error) throw new FreighterError(result.error.message, result.error.code);
  if (result.signedMessage === null) {
    throw new FreighterError("Freighter returned no signature.");
  }

  const signedMessage =
    typeof result.signedMessage === "string" ? result.signedMessage : result.signedMessage.toString("base64");

  return { signedMessage, signerAddress: result.signerAddress };
}

export async function signTransactionWithFreighter(
  transactionXdr: string,
  opts?: { networkPassphrase?: string; address?: string },
): Promise<{ signedTxXdr: string; signerAddress: string }> {
  const result = await freighterApi.signTransaction(transactionXdr, opts);
  if (result.error) throw new FreighterError(result.error.message, result.error.code);
  return { signedTxXdr: result.signedTxXdr, signerAddress: result.signerAddress };
}

export { FreighterError };
