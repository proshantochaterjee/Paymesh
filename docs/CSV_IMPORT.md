# CSV Import

Scope: bulk employee import only (per MVP feature list — contractors are
added individually in MVP, given their lower typical volume; the same
mechanism would extend to contractors post-MVP without redesign).

## 1. Expected format

```csv
full_name,email,wallet_address,department,salary_amount,pay_frequency
Jane Doe,jane@acme.xyz,GABC...XYZ,Engineering,6000,MONTHLY
John Roe,john@acme.xyz,GDEF...XYZ,Design,3000,BI_WEEKLY
```

- Header row required, exact column names above (case-insensitive
  matching, trimmed whitespace).
- `department` is created on the fly if it doesn't already exist for the
  org (matched case-insensitively against existing `Department.name`).
- `pay_frequency` must be one of `WEEKLY`, `BI_WEEKLY`, `MONTHLY`
  (case-insensitive).
- `salary_amount` must parse as a positive decimal with at most 7 decimal
  places.

## 2. Validation pipeline

Every row is validated independently against the same Zod schema used for
single-employee creation (`packages/shared/src/schemas/employee.ts`),
plus CSV-specific checks:

| Check | Failure reason code |
|---|---|
| Required column missing/empty | `MISSING_FIELD` |
| `wallet_address` not a valid checksummed Stellar `G...` address | `INVALID_WALLET_ADDRESS` |
| `email` not valid format | `INVALID_EMAIL` |
| Duplicate `email` within the same file | `DUPLICATE_IN_FILE` |
| `email` already exists as an active employee in this org | `DUPLICATE_EXISTING_EMPLOYEE` |
| `salary_amount` not a positive decimal | `INVALID_SALARY` |
| `pay_frequency` not a recognized enum value | `INVALID_FREQUENCY` |
| Row exceeds max file size (5,000 rows) | `FILE_TOO_LARGE` (whole-file rejection, not per-row) |

## 3. Dry-run mode

`POST /organizations/:id/employees/import?dryRun=true` parses and
validates the entire file **without writing anything to the database**,
returning:

```json
{
  "validRows": 45,
  "invalidRows": 3,
  "errors": [
    { "row": 12, "field": "wallet_address", "reason": "INVALID_WALLET_ADDRESS", "value": "GABC123" }
  ]
}
```

The frontend wizard always runs dry-run first (see
[WIREFRAMES.md](./WIREFRAMES.md) "CSV import wizard") and only enables the
Confirm step once the HR user has seen the error summary — invalid rows
can be excluded and the remaining valid rows imported, or the file fixed
and re-uploaded.

## 4. Commit behavior

`POST .../import` (without `dryRun`) processes **only rows that pass
validation** — a file with some invalid rows does not abort the entire
import; valid rows are created, invalid rows are returned in the same
error-list shape as the dry run so the HR user can fix and re-submit just
those.

Each successfully-created row goes through the same two-phase
Postgres-then-on-chain flow as a single employee creation
([EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) §3): one `register-intent` per
employee (`POST .../employees/:employeeId/register-intent/:intentId/submit`,
the same endpoint single-employee creation uses).

**Corrected in Step 10** (was: "one transaction covering as many
`register_employee` calls as fit... one wallet signature per chunk rather
than per employee" — confirmed against the real network to be
impossible): Soroban RPC hard-rejects any transaction containing more
than one `InvokeHostFunction` operation, so `register_employee` calls
cannot be batched into a single transaction the way this originally
described. This is unlike [PAYROLL_ENGINE.md](./PAYROLL_ENGINE.md) §2's
chunking, which stays valid — `payroll_engine.run_payroll` takes a
`Vec<u64>` of employee IDs and loops internally, so a chunk is still one
contract call, one operation, one signature; `register_employee` has no
such bulk-args variant. Practical effect: importing N employees needs N
wallet signatures, not one per chunk. The import wizard (Step 15) can
still prompt for all N sequentially within one guided flow so it reads as
a single wizard step even though the wallet still prompts N times.

## 5. Partial on-chain failure during import

If an individual employee's on-chain registration fails after its
Postgres row is created, that employee is left in the same "Registration
incomplete — Retry" state described in
[EMPLOYEE_MODEL.md](./EMPLOYEE_MODEL.md) §3 — the import wizard's final
summary screen explicitly lists them with a "Retry registration" action,
rather than silently leaving them in a state indistinguishable from a
fully successful import.

## 6. Template download

The Import CSV UI provides a "Download template" link generating the
exact header row from §1 with one example row, reducing format-mismatch
errors before the first upload attempt.
