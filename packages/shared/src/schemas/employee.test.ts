import { describe, expect, it } from "vitest";

import { csvEmployeeRowSchema } from "./csv-import";
import { createEmployeeSchema } from "./employee";

const VALID_WALLET = "G" + "A".repeat(55);

const validCoreFields = {
  fullName: "Jane Doe",
  email: "jane@acme.xyz",
  walletAddress: VALID_WALLET,
  salaryAmount: "6000",
  payFrequency: "MONTHLY" as const,
};

describe("createEmployeeSchema", () => {
  it("accepts valid input with an optional departmentId", () => {
    expect(createEmployeeSchema.safeParse(validCoreFields).success).toBe(true);
    expect(
      createEmployeeSchema.safeParse({ ...validCoreFields, departmentId: "dept_1" }).success,
    ).toBe(true);
  });

  it("rejects an invalid wallet address and an invalid pay frequency", () => {
    expect(
      createEmployeeSchema.safeParse({ ...validCoreFields, walletAddress: "bad" }).success,
    ).toBe(false);
    expect(
      createEmployeeSchema.safeParse({ ...validCoreFields, payFrequency: "DAILY" }).success,
    ).toBe(false);
  });
});

describe("csvEmployeeRowSchema", () => {
  it("enforces the same field-level rules as createEmployeeSchema, plus a department name", () => {
    expect(
      csvEmployeeRowSchema.safeParse({ ...validCoreFields, department: "Engineering" }).success,
    ).toBe(true);
    expect(csvEmployeeRowSchema.safeParse(validCoreFields).success).toBe(false); // missing department
    expect(
      csvEmployeeRowSchema.safeParse({
        ...validCoreFields,
        walletAddress: "bad",
        department: "Engineering",
      }).success,
    ).toBe(false);
  });
});
