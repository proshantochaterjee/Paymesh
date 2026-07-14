import { Injectable } from "@nestjs/common";
import type { Employee, EmployeeStatus } from "@prisma/client";
import type { CreateEmployeeInput, CsvEmployeeRow, CsvImportResult, UpdateEmployeeInput } from "@workforceos/shared";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { CsvFileTooLargeError, parseCsvBuffer, validateCsvRow } from "./csv-import.util";
import { EmployeesChainAdapter } from "./infra/employees-chain.adapter";
import { EmployeesRepository } from "./infra/employees.repository";

export interface EmployeeWithIntentResult {
  employee: Employee;
  intentId?: string;
  unsignedXdr?: string;
  expiresAt?: Date;
}

export interface IntentSubmitResult {
  status: "submitted";
  stellarTxHash: string;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly repository: EmployeesRepository,
    private readonly chainAdapter: EmployeesChainAdapter,
    private readonly intents: IntentService,
  ) {}

  private async requireOnChainOrgId(organizationId: string): Promise<bigint> {
    const onChainOrgId = await this.repository.findOnChainOrgId(organizationId);
    if (onChainOrgId === null) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }
    return onChainOrgId;
  }

  private async requireEmployee(organizationId: string, employeeId: string): Promise<Employee> {
    const employee = await this.repository.findById(organizationId, employeeId);
    if (!employee) {
      throw new DomainException("EMPLOYEE_NOT_FOUND", "No such employee.");
    }
    return employee;
  }

  async list(organizationId: string, filters: { departmentId?: string; status?: EmployeeStatus }): Promise<Employee[]> {
    return this.repository.findMany(organizationId, filters);
  }

  async getById(organizationId: string, employeeId: string): Promise<Employee> {
    return this.requireEmployee(organizationId, employeeId);
  }

  /**
   * docs/EMPLOYEE_MODEL.md §3's two-phase creation, Step 10's confirmed
   * shape: writes the Postgres row and builds the on-chain register
   * intent in one response (registration isn't an optional follow-up
   * action the way a treasury deposit is — every employee needs it).
   */
  async create(
    organizationId: string,
    callerAddress: string,
    userId: string,
    input: CreateEmployeeInput,
  ): Promise<EmployeeWithIntentResult> {
    const onChainOrgId = await this.requireOnChainOrgId(organizationId);

    const employee = await this.repository.create({
      organizationId,
      departmentId: input.departmentId,
      fullName: input.fullName,
      email: input.email,
      walletAddress: input.walletAddress,
      salaryAmount: input.salaryAmount,
      payFrequency: input.payFrequency,
    });

    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildRegisterXdr({
        callerAddress,
        onChainOrgId,
        wallet: input.walletAddress,
        salary: input.salaryAmount,
        frequency: input.payFrequency,
      }),
    );

    const intent = await this.intents.create({
      organizationId,
      type: "EMPLOYEE_REGISTER",
      unsignedXdr,
      createdById: userId,
      metadata: { employeeId: employee.id },
    });

    return { employee, ...intent };
  }

  /**
   * docs/EMPLOYEE_MODEL.md §4: Postgres updated optimistically; an
   * on-chain confirmation is only built when salary/frequency actually
   * change (a department-only edit is off-chain-only, §7) — and only when
   * the employee already has a confirmed on-chain registration, since
   * `update_employee` has no matching on-chain record to update yet
   * otherwise (E_EMPLOYEE_NOT_FOUND). If registration is still pending,
   * the edit is saved to Postgres only; the pending register-intent
   * (already built with the pre-edit values) still needs to be submitted
   * separately, and once Step 13's indexer exists this could reconcile
   * automatically — logged as follow-up debt, not solved here.
   */
  async update(
    organizationId: string,
    callerAddress: string,
    userId: string,
    employeeId: string,
    input: UpdateEmployeeInput,
  ): Promise<EmployeeWithIntentResult> {
    const existing = await this.requireEmployee(organizationId, employeeId);

    const employee = await this.repository.update(employeeId, {
      salaryAmount: input.salaryAmount,
      payFrequency: input.payFrequency,
      departmentId: input.departmentId,
    });

    const changingOnChainFields = input.salaryAmount !== undefined || input.payFrequency !== undefined;
    if (!changingOnChainFields || existing.onChainEmployeeId === null) {
      return { employee };
    }

    const onChainOrgId = await this.requireOnChainOrgId(organizationId);
    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildUpdateXdr({
        callerAddress,
        onChainOrgId,
        onChainEmployeeId: existing.onChainEmployeeId!,
        salary: employee.salaryAmount.toString(),
        frequency: employee.payFrequency,
      }),
    );

    const intent = await this.intents.create({
      organizationId,
      type: "EMPLOYEE_UPDATE",
      unsignedXdr,
      createdById: userId,
      metadata: { employeeId: employee.id },
    });

    return { employee, ...intent };
  }

  /**
   * docs/EMPLOYEE_MODEL.md §6: soft delete. If on-chain registration is
   * still pending (no onChainEmployeeId yet), there's nothing to
   * deactivate on-chain — Postgres-only, same reasoning as `update`.
   */
  async deactivate(
    organizationId: string,
    callerAddress: string,
    userId: string,
    employeeId: string,
  ): Promise<EmployeeWithIntentResult> {
    const existing = await this.requireEmployee(organizationId, employeeId);
    const employee = await this.repository.deactivate(employeeId);

    if (existing.onChainEmployeeId === null) {
      return { employee };
    }

    const onChainOrgId = await this.requireOnChainOrgId(organizationId);
    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildDeactivateXdr({
        callerAddress,
        onChainOrgId,
        onChainEmployeeId: existing.onChainEmployeeId!,
      }),
    );

    const intent = await this.intents.create({
      organizationId,
      type: "EMPLOYEE_DEACTIVATE",
      unsignedXdr,
      createdById: userId,
      metadata: { employeeId: employee.id },
    });

    return { employee, ...intent };
  }

  async submitRegisterIntent(
    organizationId: string,
    employeeId: string,
    intentId: string,
    signedXdr: string,
  ): Promise<IntentSubmitResult> {
    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "EMPLOYEE_REGISTER",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });

    const onChainEmployeeId = await this.chainAdapter.waitForRegisteredEmployeeId(result.stellarTxHash);
    if (onChainEmployeeId !== null) {
      await this.repository.backfillOnChainEmployeeId(employeeId, onChainEmployeeId);
    }

    return result;
  }

  /**
   * Waits for real confirmation (not just mempool acceptance) before
   * returning — a realistic flow chains update then deactivate for the
   * same employee/signer in quick succession, and building the next
   * transaction before this one's sequence number has actually landed
   * fails at submit time with a confusing error (found via real
   * end-to-end testing; same root cause as Milestones' state-machine
   * confirmation waits, see `EmployeesChainAdapter.waitForConfirmedSuccess`).
   */
  async submitUpdateIntent(organizationId: string, intentId: string, signedXdr: string): Promise<IntentSubmitResult> {
    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "EMPLOYEE_UPDATE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
    await this.chainAdapter.waitForConfirmedSuccess(result.stellarTxHash);
    return result;
  }

  async submitDeactivateIntent(organizationId: string, intentId: string, signedXdr: string): Promise<IntentSubmitResult> {
    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "EMPLOYEE_DEACTIVATE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });
    await this.chainAdapter.waitForConfirmedSuccess(result.stellarTxHash);
    return result;
  }

  /**
   * docs/CSV_IMPORT.md §3-4: dry-run validates and returns the error
   * summary without writing anything; a real commit creates only the rows
   * that pass validation, each going through the same two-phase flow as
   * `create()` (one register-intent per employee — docs/CSV_IMPORT.md §4's
   * Step 10 correction, Soroban can't batch multiple `register_employee`
   * calls into one transaction). A row whose Postgres write succeeds but
   * whose on-chain build fails (e.g. simulation failure) is left exactly
   * in the "Registration incomplete — Retry" state docs/EMPLOYEE_MODEL.md
   * §3 already describes for an abandoned single creation — visible via
   * `GET /employees` (onChainEmployeeId still null), not specially called
   * out in this response.
   */
  async importCsv(
    organizationId: string,
    callerAddress: string,
    userId: string,
    fileBuffer: Buffer,
    dryRun: boolean,
  ): Promise<CsvImportResult> {
    let rawRows: Record<string, string>[];
    try {
      rawRows = parseCsvBuffer(fileBuffer);
    } catch (error) {
      if (error instanceof CsvFileTooLargeError) {
        throw new DomainException("VALIDATION_ERROR", error.message, {
          reason: "FILE_TOO_LARGE",
          rowCount: error.rowCount,
        });
      }
      throw error;
    }

    const errors: CsvImportResult["errors"] = [];
    const invalidRowNumbers = new Set<number>();
    const seenEmails = new Set<string>();
    const candidates: Array<{ rowNumber: number; data: CsvEmployeeRow }> = [];

    rawRows.forEach((row, index) => {
      const rowNumber = index + 2; // header is row 1, data starts at row 2
      const result = validateCsvRow(row, rowNumber);
      if ("errors" in result) {
        errors.push(...result.errors);
        invalidRowNumbers.add(rowNumber);
        return;
      }
      const emailKey = result.data.email.toLowerCase();
      if (seenEmails.has(emailKey)) {
        errors.push({ row: rowNumber, field: "email", reason: "DUPLICATE_IN_FILE", value: result.data.email });
        invalidRowNumbers.add(rowNumber);
        return;
      }
      seenEmails.add(emailKey);
      candidates.push({ rowNumber, data: result.data });
    });

    const toCreate: typeof candidates = [];
    for (const candidate of candidates) {
      const existing = await this.repository.findActiveByEmail(organizationId, candidate.data.email);
      if (existing) {
        errors.push({ row: candidate.rowNumber, field: "email", reason: "DUPLICATE_EXISTING_EMPLOYEE", value: candidate.data.email });
        invalidRowNumbers.add(candidate.rowNumber);
        continue;
      }
      toCreate.push(candidate);
    }

    if (dryRun) {
      return { validRows: toCreate.length, invalidRows: invalidRowNumbers.size, errors };
    }

    const departmentIdCache = new Map<string, string>();
    const createdEmployees: NonNullable<CsvImportResult["createdEmployees"]> = [];
    for (const candidate of toCreate) {
      const departmentKey = candidate.data.department.toLowerCase();
      let departmentId = departmentIdCache.get(departmentKey);
      if (!departmentId) {
        const department = await this.repository.findOrCreateDepartment(organizationId, candidate.data.department);
        departmentId = department.id;
        departmentIdCache.set(departmentKey, departmentId);
      }

      const result = await this.create(organizationId, callerAddress, userId, {
        fullName: candidate.data.fullName,
        email: candidate.data.email,
        walletAddress: candidate.data.walletAddress,
        salaryAmount: candidate.data.salaryAmount,
        payFrequency: candidate.data.payFrequency,
        departmentId,
      });

      if (result.intentId && result.unsignedXdr && result.expiresAt) {
        createdEmployees.push({
          employeeId: result.employee.id,
          intentId: result.intentId,
          unsignedXdr: result.unsignedXdr,
          expiresAt: result.expiresAt.toISOString(),
        });
      }
    }

    return {
      validRows: toCreate.length,
      invalidRows: invalidRowNumbers.size,
      errors,
      createdEmployees,
    };
  }
}
