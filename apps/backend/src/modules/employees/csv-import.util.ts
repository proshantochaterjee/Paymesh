import { parse } from "csv-parse/sync";
import {
  CSV_IMPORT_MAX_ROWS,
  CSV_IMPORT_REQUIRED_COLUMNS,
  PAY_FREQUENCIES,
  decimalAmountSchema,
  stellarAddressSchema,
  type CsvEmployeeRow,
  type CsvImportRowError,
  type PayFrequency,
} from "@workforceos/shared";
import { z } from "zod";

/** docs/CSV_IMPORT.md §1: header row required, case-insensitive column matching, trimmed whitespace. */
export function parseCsvBuffer(buffer: Buffer): Record<string, string>[] {
  const rows: Record<string, string>[] = parse(buffer, {
    columns: (header: string[]) => header.map((column) => column.trim().toLowerCase()),
    skip_empty_lines: true,
    trim: true,
  });
  if (rows.length > CSV_IMPORT_MAX_ROWS) {
    throw new CsvFileTooLargeError(rows.length);
  }
  return rows;
}

export class CsvFileTooLargeError extends Error {
  constructor(public readonly rowCount: number) {
    super(`File has ${rowCount} rows, exceeding the ${CSV_IMPORT_MAX_ROWS} row limit.`);
  }
}

/**
 * docs/CSV_IMPORT.md §2's validation table, checked in the documented
 * order: presence first (MISSING_FIELD short-circuits the rest, since a
 * missing wallet address can't also be "invalid format"), then each
 * field's own format.
 */
export function validateCsvRow(
  row: Record<string, string>,
  rowNumber: number,
): { data: CsvEmployeeRow } | { errors: CsvImportRowError[] } {
  const missing = CSV_IMPORT_REQUIRED_COLUMNS.filter((column) => !row[column]?.trim());
  if (missing.length > 0) {
    return {
      errors: missing.map((field) => ({ row: rowNumber, field, reason: "MISSING_FIELD", value: row[field] ?? "" })),
    };
  }

  // Presence of every required column was just confirmed above.
  const fullName = row.full_name as string;
  const email = row.email as string;
  const walletAddress = row.wallet_address as string;
  const department = row.department as string;
  const salaryAmount = row.salary_amount as string;
  const payFrequency = row.pay_frequency as string;

  const errors: CsvImportRowError[] = [];

  if (!stellarAddressSchema.safeParse(walletAddress).success) {
    errors.push({ row: rowNumber, field: "wallet_address", reason: "INVALID_WALLET_ADDRESS", value: walletAddress });
  }
  if (!z.email().safeParse(email).success) {
    errors.push({ row: rowNumber, field: "email", reason: "INVALID_EMAIL", value: email });
  }
  if (!decimalAmountSchema.safeParse(salaryAmount).success) {
    errors.push({ row: rowNumber, field: "salary_amount", reason: "INVALID_SALARY", value: salaryAmount });
  }
  const frequency = payFrequency.toUpperCase();
  if (!(PAY_FREQUENCIES as readonly string[]).includes(frequency)) {
    errors.push({ row: rowNumber, field: "pay_frequency", reason: "INVALID_FREQUENCY", value: payFrequency });
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    data: {
      fullName: fullName.trim(),
      email: email.trim(),
      walletAddress: walletAddress.trim(),
      department: department.trim(),
      salaryAmount: salaryAmount.trim(),
      payFrequency: frequency as PayFrequency,
    },
  };
}
