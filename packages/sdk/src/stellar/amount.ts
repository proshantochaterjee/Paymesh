/**
 * USDC SAC precision (docs/BLOCKCHAIN_ARCHITECTURE.md §1, matches
 * `decimalAmountSchema` in packages/shared/src/schemas/primitives.ts).
 */
const USDC_DECIMALS = 7;
const USDC_SCALE = 10n ** BigInt(USDC_DECIMALS);

/** Converts a decimal string amount (e.g. "12500.5") to raw i128 stroops for a contract call. */
export function decimalToStroops(amount: string): bigint {
  const [whole = "0", fraction = ""] = amount.split(".");
  const paddedFraction = fraction.padEnd(USDC_DECIMALS, "0").slice(0, USDC_DECIMALS);
  return BigInt(whole) * USDC_SCALE + BigInt(paddedFraction || "0");
}

/** Converts raw i128 stroops (e.g. from `treasury.get_balance()`) to a decimal string. */
export function stroopsToDecimal(stroops: bigint): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / USDC_SCALE;
  const fraction = (abs % USDC_SCALE).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const sign = negative ? "-" : "";
  return fraction.length > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}
