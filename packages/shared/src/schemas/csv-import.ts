import { z } from "zod";

import { CSV_IMPORT_FAILURE_REASONS } from "../constants/csv-import.js";
import { employeeCoreFieldsSchema } from "./employee.js";
import { idSchema } from "./primitives.js";

/**
 * One row of the employee CSV import (docs/CSV_IMPORT.md §1-2). Reuses
 * employeeCoreFieldsSchema for field-level validation shared with
 * single-employee creation; `department` is a free-text name here
 * (created on the fly if it doesn't exist), unlike the API's `departmentId`.
 */
export const csvEmployeeRowSchema = employeeCoreFieldsSchema.extend({
  department: z.string().min(1),
});
export type CsvEmployeeRow = z.infer<typeof csvEmployeeRowSchema>;

export const csvImportQuerySchema = z.object({
  dryRun: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});
export type CsvImportQuery = z.infer<typeof csvImportQuerySchema>;

/** docs/CSV_IMPORT.md §2's failure table. */
export const csvImportErrorSchema = z.object({
  row: z.number().int(),
  field: z.string(),
  reason: z.enum(CSV_IMPORT_FAILURE_REASONS),
  value: z.string(),
});
export type CsvImportRowError = z.infer<typeof csvImportErrorSchema>;

/**
 * docs/CSV_IMPORT.md §3-4: dry-run returns only `validRows`/`invalidRows`/
 * `errors`; a real commit additionally returns one register-intent per
 * successfully-created employee (docs/CSV_IMPORT.md §4's Step 10
 * correction — Soroban can't batch multiple `register_employee` calls
 * into one transaction, so this is N intents, not one-per-chunk).
 */
export const csvImportResultSchema = z.object({
  validRows: z.number().int(),
  invalidRows: z.number().int(),
  errors: z.array(csvImportErrorSchema),
  createdEmployees: z
    .array(
      z.object({
        employeeId: idSchema,
        intentId: idSchema,
        unsignedXdr: z.string(),
        expiresAt: z.string(),
      }),
    )
    .optional(),
});
export type CsvImportResult = z.infer<typeof csvImportResultSchema>;
