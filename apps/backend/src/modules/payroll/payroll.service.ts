import { Injectable } from "@nestjs/common";
import type { PayrollItem, PayrollRun } from "@prisma/client";
import { decimalToStroops, stroopsToDecimal } from "@workforceos/sdk";
import { PAYROLL_CHUNK_SIZE, type CreatePayrollRunInput } from "@workforceos/shared";

import { DomainException } from "../../common/exceptions/domain.exception";
import { IntentService } from "../../common/intent/intent.service";
import { PayrollChainAdapter } from "./infra/payroll-chain.adapter";
import { PayrollRepository } from "./infra/payroll.repository";
import { deriveChunkRunId } from "./run-id.util";

export interface ExecuteIntentResult {
  intentId: string;
  unsignedXdr: string;
  expiresAt: Date;
  chunkIndex: number;
  totalChunks: number;
  employeeIds: string[];
}

export interface SubmitExecuteIntentResult {
  status: "submitted";
  stellarTxHash: string;
  isLastChunk: boolean;
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly repository: PayrollRepository,
    private readonly chainAdapter: PayrollChainAdapter,
    private readonly intents: IntentService,
  ) {}

  private async requireRun(organizationId: string, runId: string): Promise<PayrollRun & { items: PayrollItem[] }> {
    const run = await this.repository.findById(organizationId, runId);
    if (!run) {
      throw new DomainException("PAYROLL_RUN_NOT_FOUND", "No such payroll run.");
    }
    return run;
  }

  async list(organizationId: string): Promise<PayrollRun[]> {
    return this.repository.findMany(organizationId);
  }

  async getById(organizationId: string, runId: string): Promise<PayrollRun & { items: PayrollItem[] }> {
    return this.requireRun(organizationId, runId);
  }

  /**
   * docs/PAYROLL_ENGINE.md §5: the preview *is* this response — total
   * cost, per-item amounts — computed purely from Postgres, no chain call.
   * docs/EMPLOYEE_MODEL.md §3: only employees with a confirmed
   * `onChainEmployeeId` are payroll-eligible; the whole request is
   * rejected (not silently filtered) if any selected employee isn't,
   * since silently dropping one would make the returned total wrong
   * without an obvious explanation.
   */
  async create(
    organizationId: string,
    userId: string,
    input: CreatePayrollRunInput,
  ): Promise<PayrollRun & { items: PayrollItem[] }> {
    const employees = await this.repository.findEligibleEmployees(organizationId, input.employeeIds);

    const foundIds = new Set(employees.map((e) => e.id));
    const missing = input.employeeIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      throw new DomainException("EMPLOYEE_NOT_FOUND", "One or more employees don't belong to this organization.", {
        employeeIds: missing,
      });
    }

    const ineligible = employees.filter((e) => e.status !== "ACTIVE" || e.onChainEmployeeId === null);
    if (ineligible.length > 0) {
      throw new DomainException(
        "VALIDATION_ERROR",
        "One or more employees are not eligible for payroll (must be ACTIVE and have a confirmed on-chain registration).",
        { employeeIds: ineligible.map((e) => e.id) },
      );
    }

    const items = employees.map((employee) => ({ employeeId: employee.id, amount: employee.salaryAmount.toString() }));
    const totalAmount = stroopsToDecimal(items.reduce((sum, item) => sum + decimalToStroops(item.amount), 0n));

    return this.repository.createRun({
      organizationId,
      payPeriodStart: input.payPeriodStart,
      payPeriodEnd: input.payPeriodEnd,
      totalAmount,
      createdById: userId,
      items,
    });
  }

  async schedule(organizationId: string, runId: string): Promise<PayrollRun> {
    const run = await this.requireRun(organizationId, runId);
    if (run.status !== "DRAFT") {
      throw new DomainException("INVALID_STATE_TRANSITION", `Cannot schedule a run in ${run.status} status.`);
    }
    await this.repository.updateRunStatus(runId, "SCHEDULED");
    return { ...run, status: "SCHEDULED" };
  }

  /**
   * docs/PAYROLL_ENGINE.md §2: chunks execute sequentially — this always
   * builds the *next* unprocessed chunk only (never all of them at once),
   * since each needs its own wallet signature and a caller can't submit
   * chunk 2 before chunk 1 anyway. docs/PAYROLL_ENGINE.md §3: a proactive
   * balance check runs before simulation, so an underfunded treasury
   * produces a clear "fund $X more" error instead of an opaque
   * simulation/per-item failure.
   */
  async buildExecuteIntent(
    organizationId: string,
    callerAddress: string,
    userId: string,
    runId: string,
  ): Promise<ExecuteIntentResult> {
    const run = await this.requireRun(organizationId, runId);
    if (run.status !== "SCHEDULED" && run.status !== "EXECUTING") {
      throw new DomainException("INVALID_STATE_TRANSITION", `Cannot execute a run in ${run.status} status.`);
    }

    const pendingItems = await this.repository.findPendingItems(runId, PAYROLL_CHUNK_SIZE);
    if (pendingItems.length === 0) {
      throw new DomainException("INVALID_STATE_TRANSITION", "This run has no remaining items to execute.");
    }

    const counts = await this.repository.countItemsByStatus(runId);
    const totalChunks = Math.ceil(run.items.length / PAYROLL_CHUNK_SIZE);
    const chunkIndex = Math.floor((counts.PAID + counts.FAILED) / PAYROLL_CHUNK_SIZE);

    const onChainOrgId = await this.requireOnChainOrgId(organizationId);
    const treasuryAddress = await this.requireTreasuryAddress(organizationId);

    const chunkTotal = pendingItems.reduce((sum, item) => sum + decimalToStroops(item.amount.toString()), 0n);
    const balance = await this.chainAdapter.getTreasuryBalanceStroops(treasuryAddress);
    if (balance < chunkTotal) {
      const shortfall = stroopsToDecimal(chunkTotal - balance);
      throw new DomainException("INSUFFICIENT_TREASURY_BALANCE", `Treasury needs at least ${shortfall} more to run this chunk.`, {
        shortfall,
      });
    }

    const runIdOnChain = deriveChunkRunId(runId, chunkIndex);
    const { unsignedXdr } = await this.intents.buildXdrOrThrow(() =>
      this.chainAdapter.buildRunPayrollXdr({
        authorizerAddress: callerAddress,
        onChainOrgId,
        runId: runIdOnChain,
        employeeIds: pendingItems.map((item) => item.employee.onChainEmployeeId!),
      }),
    );

    const intent = await this.intents.create({
      organizationId,
      type: "PAYROLL_EXECUTE",
      unsignedXdr,
      createdById: userId,
      metadata: { payrollRunId: runId, chunkIndex: String(chunkIndex), itemIds: pendingItems.map((i) => i.id).join(",") },
    });

    if (run.status === "SCHEDULED") {
      await this.repository.updateRunStatus(runId, "EXECUTING");
    }

    return { ...intent, chunkIndex, totalChunks, employeeIds: pendingItems.map((i) => i.employeeId) };
  }

  async submitExecuteIntent(
    organizationId: string,
    runId: string,
    intentId: string,
    signedXdr: string,
  ): Promise<SubmitExecuteIntentResult> {
    const intent = await this.intents.validateForSubmit(intentId, organizationId, "PAYROLL_EXECUTE");
    const metadata = intent.metadata as { payrollRunId: string; itemIds: string } | null;
    if (!metadata || metadata.payrollRunId !== runId) {
      throw new DomainException("INTENT_EXPIRED", "This intent does not exist or has expired.");
    }
    const itemIds = metadata.itemIds.split(",");

    const result = await this.intents.submitAndConsume({
      intentId,
      organizationId,
      expectedType: "PAYROLL_EXECUTE",
      signedXdr,
      submit: (xdr) => this.chainAdapter.submitSignedXdr(xdr),
    });

    await this.reconcileChunk(itemIds, result.stellarTxHash);
    const isLastChunk = await this.finalizeRunIfComplete(runId);

    return { ...result, isLastChunk };
  }

  private async reconcileChunk(itemIds: string[], stellarTxHash: string): Promise<void> {
    const items = await this.repository.findItemsByIds(itemIds);
    const payrollResult = await this.chainAdapter.waitForPayrollResult(stellarTxHash);

    if (!payrollResult) {
      // Transaction sent but never confirmed SUCCESS (e.g. reverted) —
      // items stay PENDING; the run is left in EXECUTING so a retry can
      // pick this same chunk back up via buildExecuteIntent.
      return;
    }

    const succeededIds = new Set(payrollResult.succeeded.map(String));
    const failedReasons = new Map(payrollResult.failed.map(([id, reason]) => [String(id), reason]));

    for (const item of items) {
      const onChainId = String(item.employee.onChainEmployeeId);
      if (succeededIds.has(onChainId)) {
        await this.repository.markItemPaid(item.id, stellarTxHash);
      } else if (failedReasons.has(onChainId)) {
        await this.repository.markItemFailed(item.id, stellarTxHash, failedReasons.get(onChainId)!);
      }
    }
  }

  /** Returns true when this was the run's last chunk (no PENDING items remain). */
  private async finalizeRunIfComplete(runId: string): Promise<boolean> {
    const counts = await this.repository.countItemsByStatus(runId);
    if (counts.PENDING > 0) {
      return false;
    }
    const status = counts.FAILED === 0 ? "COMPLETED" : counts.PAID === 0 ? "FAILED" : "PARTIAL";
    await this.repository.updateRunStatus(runId, status);
    return true;
  }

  private async requireOnChainOrgId(organizationId: string): Promise<bigint> {
    const onChainOrgId = await this.repository.findOnChainOrgId(organizationId);
    if (onChainOrgId === null) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }
    return onChainOrgId;
  }

  private async requireTreasuryAddress(organizationId: string): Promise<string> {
    const address = await this.repository.findTreasuryContractAddress(organizationId);
    if (!address) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }
    return address;
  }
}
