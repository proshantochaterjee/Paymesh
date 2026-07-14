import { Injectable } from "@nestjs/common";
import { decimalToStroops, stroopsToDecimal } from "@workforceos/sdk";

import { DomainException } from "../../common/exceptions/domain.exception";
import { AnalyticsChainAdapter } from "./infra/analytics-chain.adapter";
import { AnalyticsRepository } from "./infra/analytics.repository";

const TRENDS_MONTHS_BACK = 6;
/** Which `TransactionType`s represent money actually leaving the treasury contract (docs/EVENT_INDEXING.md's treasury event mapping). */
const TREASURY_OUTFLOW_TYPES = ["WITHDRAWAL", "PAYROLL_DISBURSEMENT", "MILESTONE_FUND"];

/** Sums decimal-string amounts via raw stroops (bigint) rather than floating point. */
function sumDecimalStrings(amounts: string[]): string {
  const total = amounts.reduce((sum, amount) => sum + decimalToStroops(amount), 0n);
  return stroopsToDecimal(total);
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthsAgo(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, 1));
}

function monthKey(date: Date): string {
  return date.toISOString().slice(0, 7); // "YYYY-MM"
}

export interface OverviewResult {
  headcount: number;
  treasuryBalance: string;
  monthToDateSpend: string;
}

export interface MonthlyBucket {
  month: string;
  totalAmount: string;
}

export interface TreasuryFlowBucket {
  month: string;
  inflow: string;
  outflow: string;
}

export interface DepartmentSpendResult {
  departmentId: string | null;
  departmentName: string;
  totalAmount: string;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly repository: AnalyticsRepository,
    private readonly chainAdapter: AnalyticsChainAdapter,
  ) {}

  /** docs/TREASURY_ARCHITECTURE.md §2: balance is always read live from chain, never a cached Postgres column. */
  async getOverview(organizationId: string): Promise<OverviewResult> {
    const treasuryContractAddr = await this.repository.findTreasuryContractAddr(organizationId);
    if (!treasuryContractAddr) {
      throw new DomainException("ORGANIZATION_NOT_FOUND", "No such organization.");
    }

    const [headcount, treasuryBalance, spendAmounts] = await Promise.all([
      this.repository.countActiveEmployees(organizationId),
      this.chainAdapter.getTreasuryBalance(treasuryContractAddr),
      this.repository.findTransactionAmounts(organizationId, TREASURY_OUTFLOW_TYPES, startOfMonth(new Date())),
    ]);

    return { headcount, treasuryBalance, monthToDateSpend: sumDecimalStrings(spendAmounts) };
  }

  async getPayrollTrends(organizationId: string): Promise<MonthlyBucket[]> {
    const since = monthsAgo(new Date(), TRENDS_MONTHS_BACK - 1);
    const runs = await this.repository.findCompletedPayrollRunsSince(organizationId, since);

    const buckets = new Map<string, string[]>();
    for (const run of runs) {
      const key = monthKey(run.payPeriodStart);
      buckets.set(key, [...(buckets.get(key) ?? []), run.totalAmount]);
    }

    return this.monthRange().map((month) => ({ month, totalAmount: sumDecimalStrings(buckets.get(month) ?? []) }));
  }

  async getTreasuryFlow(organizationId: string): Promise<TreasuryFlowBucket[]> {
    const since = monthsAgo(new Date(), TRENDS_MONTHS_BACK - 1);
    const transactions = await this.repository.findTransactionsSince(organizationId, since);

    const inflowBuckets = new Map<string, string[]>();
    const outflowBuckets = new Map<string, string[]>();
    for (const tx of transactions) {
      const key = monthKey(tx.createdAt);
      if (tx.type === "DEPOSIT") {
        inflowBuckets.set(key, [...(inflowBuckets.get(key) ?? []), tx.amount]);
      } else if (TREASURY_OUTFLOW_TYPES.includes(tx.type)) {
        outflowBuckets.set(key, [...(outflowBuckets.get(key) ?? []), tx.amount]);
      }
    }

    return this.monthRange().map((month) => ({
      month,
      inflow: sumDecimalStrings(inflowBuckets.get(month) ?? []),
      outflow: sumDecimalStrings(outflowBuckets.get(month) ?? []),
    }));
  }

  async getDepartmentSpend(organizationId: string): Promise<DepartmentSpendResult[]> {
    const items = await this.repository.findPaidPayrollItemsByDepartment(organizationId);

    const buckets = new Map<string, { departmentId: string | null; departmentName: string; amounts: string[] }>();
    for (const item of items) {
      const key = item.departmentId ?? "unassigned";
      const bucket = buckets.get(key) ?? { departmentId: item.departmentId, departmentName: item.departmentName ?? "Unassigned", amounts: [] };
      bucket.amounts.push(item.amount);
      buckets.set(key, bucket);
    }

    return Array.from(buckets.values()).map((bucket) => ({
      departmentId: bucket.departmentId,
      departmentName: bucket.departmentName,
      totalAmount: sumDecimalStrings(bucket.amounts),
    }));
  }

  /** Ascending chronological `YYYY-MM` keys for the trailing `TRENDS_MONTHS_BACK` months, oldest first. */
  private monthRange(): string[] {
    const now = new Date();
    const months: string[] = [];
    for (let i = TRENDS_MONTHS_BACK - 1; i >= 0; i--) {
      months.push(monthKey(monthsAgo(now, i)));
    }
    return months;
  }
}
