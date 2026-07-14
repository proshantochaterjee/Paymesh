import { describe, expect, it } from "vitest";

import { CsvFileTooLargeError, parseCsvBuffer, validateCsvRow } from "./csv-import.util";

const validRow = {
  full_name: "Ada Lovelace",
  email: "ada@example.com",
  wallet_address: "G" + "A".repeat(55),
  department: "Engineering",
  salary_amount: "5000",
  pay_frequency: "monthly",
};

describe("parseCsvBuffer", () => {
  it("parses a header row case-insensitively and trims whitespace", () => {
    const csv = "Full_Name, Email ,Wallet_Address,Department,Salary_Amount,Pay_Frequency\nAda, ada@example.com ,GABC,Eng,5000,MONTHLY\n";
    const rows = parseCsvBuffer(Buffer.from(csv));
    expect(rows).toEqual([
      { full_name: "Ada", email: "ada@example.com", wallet_address: "GABC", department: "Eng", salary_amount: "5000", pay_frequency: "MONTHLY" },
    ]);
  });

  it("throws CsvFileTooLargeError past the row cap", () => {
    const header = "full_name,email,wallet_address,department,salary_amount,pay_frequency\n";
    const rows = Array.from({ length: 5001 }, (_, i) => `Person ${i},p${i}@example.com,GABC,Eng,1000,MONTHLY`).join("\n");
    expect(() => parseCsvBuffer(Buffer.from(header + rows))).toThrow(CsvFileTooLargeError);
  });
});

describe("validateCsvRow", () => {
  it("accepts a fully valid row, normalizing pay_frequency to uppercase", () => {
    const result = validateCsvRow(validRow, 2);
    expect(result).toEqual({
      data: {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        walletAddress: "G" + "A".repeat(55),
        department: "Engineering",
        salaryAmount: "5000",
        payFrequency: "MONTHLY",
      },
    });
  });

  it("reports MISSING_FIELD for every empty required column, short-circuiting format checks", () => {
    const result = validateCsvRow({ ...validRow, email: "", wallet_address: "" }, 3);
    expect(result).toEqual({
      errors: [
        { row: 3, field: "email", reason: "MISSING_FIELD", value: "" },
        { row: 3, field: "wallet_address", reason: "MISSING_FIELD", value: "" },
      ],
    });
  });

  it("reports INVALID_WALLET_ADDRESS for a malformed wallet address", () => {
    const result = validateCsvRow({ ...validRow, wallet_address: "not-an-address" }, 4);
    expect(result).toEqual({ errors: [{ row: 4, field: "wallet_address", reason: "INVALID_WALLET_ADDRESS", value: "not-an-address" }] });
  });

  it("reports INVALID_EMAIL for a malformed email", () => {
    const result = validateCsvRow({ ...validRow, email: "not-an-email" }, 5);
    expect(result).toEqual({ errors: [{ row: 5, field: "email", reason: "INVALID_EMAIL", value: "not-an-email" }] });
  });

  it("reports INVALID_SALARY for a non-positive amount", () => {
    const result = validateCsvRow({ ...validRow, salary_amount: "-5" }, 6);
    expect(result).toEqual({ errors: [{ row: 6, field: "salary_amount", reason: "INVALID_SALARY", value: "-5" }] });
  });

  it("reports INVALID_FREQUENCY for an unrecognized frequency", () => {
    const result = validateCsvRow({ ...validRow, pay_frequency: "YEARLY" }, 7);
    expect(result).toEqual({ errors: [{ row: 7, field: "pay_frequency", reason: "INVALID_FREQUENCY", value: "YEARLY" }] });
  });

  it("reports multiple format errors on the same row together", () => {
    const result = validateCsvRow({ ...validRow, email: "bad", salary_amount: "bad" }, 8);
    expect(result).toEqual({
      errors: [
        { row: 8, field: "email", reason: "INVALID_EMAIL", value: "bad" },
        { row: 8, field: "salary_amount", reason: "INVALID_SALARY", value: "bad" },
      ],
    });
  });
});
