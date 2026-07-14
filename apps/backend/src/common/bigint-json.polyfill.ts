/**
 * Native `JSON.stringify` cannot serialize `BigInt` (throws `TypeError:
 * Do not know how to serialize a BigInt`) — several Prisma columns are
 * `BigInt` (on-chain IDs: `Employee.onChainEmployeeId`,
 * `Organization.onChainOrgId`, more to come in later steps), and the
 * shared response schemas already model these as strings
 * (`employeeSchema.onChainEmployeeId: z.string().nullable()`), so a
 * global `toJSON` is the one-time fix rather than converting to string
 * by hand at every call site that happens to return one of these fields.
 * Imported once, for its side effect, at the top of app.module.ts so it
 * runs before any request handling regardless of entry point (prod
 * `main.ts` or a test's `Test.createTestingModule`).
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (this: bigint): string {
  return this.toString();
};

export {};
