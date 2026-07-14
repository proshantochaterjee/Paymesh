// docs/CSV_IMPORT.md
export const CSV_IMPORT_MAX_ROWS = 5000;

export const CSV_IMPORT_FAILURE_REASONS = [
  "MISSING_FIELD",
  "INVALID_WALLET_ADDRESS",
  "INVALID_EMAIL",
  "DUPLICATE_IN_FILE",
  "DUPLICATE_EXISTING_EMPLOYEE",
  "INVALID_SALARY",
  "INVALID_FREQUENCY",
  "FILE_TOO_LARGE",
] as const;

export type CsvImportFailureReason = (typeof CSV_IMPORT_FAILURE_REASONS)[number];

export const CSV_IMPORT_REQUIRED_COLUMNS = [
  "full_name",
  "email",
  "wallet_address",
  "department",
  "salary_amount",
  "pay_frequency",
] as const;
