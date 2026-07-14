import { DomainException } from "../exceptions/domain.exception";
import type { AuthenticatedUser } from "../types/authenticated-request";

/**
 * The address that ends up signing client-side must match `caller`/
 * `authorizer` in the on-chain call (`require_auth()`), so unlike
 * treasury (any address can deposit/withdraw, specified explicitly in
 * the body) an Employees/Payroll action's caller is always the acting
 * user's own linked wallet. Factored out of `employees.controller.ts` in
 * Step 11 once `payroll.controller.ts` needed the exact same check — a
 * real second consumer, not speculative reuse.
 */
export function requireCallerAddress(user: AuthenticatedUser): string {
  if (!user.primaryWallet) {
    throw new DomainException("VALIDATION_ERROR", "Link a Stellar wallet to your account before performing on-chain actions.");
  }
  return user.primaryWallet;
}
