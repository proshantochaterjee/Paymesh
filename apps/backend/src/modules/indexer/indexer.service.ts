import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CONTRACT_EVENT_TOPICS, TRANSFER_OUT_REASON } from "@workforceos/shared";
import { stroopsToDecimal } from "@workforceos/sdk";

import type { AppConfig } from "../../config/config.schema";
import { IndexerChainAdapter, type DecodedContractEvent } from "./infra/indexer-chain.adapter";
import { IndexerRepository } from "./infra/indexer.repository";

type WatchedContractKind = "payroll_factory" | "organization" | "treasury" | "employee_registry" | "payroll_engine" | "milestone_engine";

interface WatchedContract {
  address: string;
  kind: WatchedContractKind;
  organizationId?: string;
}

/** Soroban RPC's `getEvents` JSON-RPC error for a `startLedger` past its own (not the network's) indexing frontier. */
function isLedgerNotYetIndexedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string" &&
    (error as { message: string }).message.includes("ledger range")
  );
}

/**
 * docs/EVENT_INDEXING.md: polls Stellar RPC for every watched contract's
 * events since its last checkpoint and materializes them into Postgres.
 * Runs as a BullMQ repeatable job (`indexer.processor.ts`), not on the
 * request path — no controller calls into this service.
 */
@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);

  constructor(
    private readonly repository: IndexerRepository,
    private readonly chainAdapter: IndexerChainAdapter,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private async listWatchedContracts(): Promise<WatchedContract[]> {
    const singletons: WatchedContract[] = [
      { address: this.configService.get("STELLAR_FACTORY_CONTRACT_ADDRESS", { infer: true }), kind: "payroll_factory" },
      { address: this.configService.get("STELLAR_EMPLOYEE_REGISTRY_CONTRACT_ADDRESS", { infer: true }), kind: "employee_registry" },
      { address: this.configService.get("STELLAR_PAYROLL_ENGINE_CONTRACT_ADDRESS", { infer: true }), kind: "payroll_engine" },
      { address: this.configService.get("STELLAR_MILESTONE_ENGINE_CONTRACT_ADDRESS", { infer: true }), kind: "milestone_engine" },
    ];

    const organizations = await this.repository.listOrganizationContracts();
    const perOrg: WatchedContract[] = organizations.flatMap((org) => [
      { address: org.organizationContractAddr, kind: "organization" as const, organizationId: org.id },
      { address: org.treasuryContractAddr, kind: "treasury" as const, organizationId: org.id },
    ]);

    return [...singletons, ...perOrg];
  }

  async pollAll(): Promise<void> {
    const contracts = await this.listWatchedContracts();
    for (const contract of contracts) {
      try {
        await this.pollContract(contract);
      } catch (error) {
        // docs/EVENT_INDEXING.md §6: repeated RPC failures get BullMQ's own
        // retry/backoff at the job level — a single contract's poll
        // failing this tick must not stop the rest from being checked.
        const message = error instanceof Error ? error.message : JSON.stringify(error);
        this.logger.error(`Failed to poll ${contract.kind} ${contract.address}: ${message}`);
      }
    }
  }

  private async pollContract(contract: WatchedContract): Promise<void> {
    const cursor = await this.repository.getCursor(contract.address);

    if (!cursor) {
      // First time this contract has ever been seen: no historical
      // backfill (docs/DEVELOPMENT_PLAN.md's Step 13 entry notes this as a
      // known MVP limitation, not silently assumed) — baseline the cursor
      // at the current head and start picking up events from the next
      // poll onward.
      const latestLedger = await this.chainAdapter.getLatestLedgerSequence();
      await this.repository.upsertCursor(contract.address, BigInt(latestLedger));
      return;
    }

    const startLedger = Number(cursor.lastLedgerSequence) + 1;
    let events: DecodedContractEvent[];
    try {
      events = await this.chainAdapter.getContractEvents(contract.address, startLedger);
    } catch (error) {
      // The RPC node's own event-indexing frontier can lag a ledger or two
      // behind `getLatestLedger()`'s consensus view (observed for real
      // against Testnet — a cursor baselined this tick can be briefly
      // ahead of what `getEvents` considers valid). Not a failure, just
      // "nothing new yet" — retried next poll, cursor left untouched.
      if (isLedgerNotYetIndexedError(error)) return;
      throw error;
    }
    if (events.length === 0) return;

    for (const event of events) {
      try {
        await this.handleEvent(event, contract);
      } catch (error) {
        // docs/EVENT_INDEXING.md §6: a single malformed/unrecognized event
        // is logged and skipped, never crashes the batch.
        this.logger.warn(`Skipping unhandled event ${event.id} on ${contract.kind}: ${error instanceof Error ? error.message : error}`);
      }
    }

    const maxLedger = Math.max(...events.map((event) => event.ledger));
    await this.repository.upsertCursor(contract.address, BigInt(maxLedger));
  }

  private async handleEvent(event: DecodedContractEvent, contract: WatchedContract): Promise<void> {
    const topicName = event.topic[0];
    if (typeof topicName !== "string") return;

    switch (contract.kind) {
      case "treasury":
        await this.handleTreasuryEvent(event, topicName, contract.organizationId!, contract.address);
        return;
      case "milestone_engine":
        await this.handleMilestoneEvent(event, topicName);
        return;
      case "payroll_factory":
      case "organization":
      case "employee_registry":
      case "payroll_engine":
        // docs/EVENT_INDEXING.md §2: org_created/wasm_hash_updated have no
        // DB effect (the Organization row is written synchronously by the
        // API on confirmed submission); role_granted/revoked and the
        // employee_registry events are likewise already reconciled
        // synchronously by the Organizations/Employees modules'
        // confirmation-polling submit methods. payroll_engine's
        // payroll_item_paid/failed/run_completed are NOT reconciled here:
        // `run_id` is a one-way SHA-256 hash of (PayrollRun.id, chunkIndex)
        // (packages/sdk consumers — see run-id.util.ts) with no persisted
        // reverse mapping, so this indexer cannot resolve an event's
        // `run_id` back to a Postgres `PayrollRun` without additional
        // plumbing not in scope this step; Payroll's own synchronous
        // `reconcileChunk` (Step 11) remains the sole source of truth for
        // payroll status. Logged as follow-up debt, not silently dropped.
        this.logger.debug(`No DB effect for ${topicName} on ${contract.kind}`);
        return;
    }
  }

  private async handleTreasuryEvent(
    event: DecodedContractEvent,
    topicName: string,
    organizationId: string,
    treasuryAddress: string,
  ): Promise<void> {
    const base = {
      organizationId,
      status: "CONFIRMED" as const,
      stellarTxHash: event.txHash,
      stellarEventId: event.id,
      ledgerSequence: BigInt(event.ledger),
    };

    switch (topicName) {
      case CONTRACT_EVENT_TOPICS.DEPOSITED: {
        const { from, amount } = event.value as { from: string; amount: bigint };
        await this.repository.upsertTransaction({
          ...base,
          type: "DEPOSIT",
          amount: stroopsToDecimal(amount),
          fromAddress: from,
          toAddress: treasuryAddress,
        });
        return;
      }
      case CONTRACT_EVENT_TOPICS.WITHDRAWN: {
        const { to, amount } = event.value as { to: string; amount: bigint; authorized_by: string };
        await this.repository.upsertTransaction({
          ...base,
          type: "WITHDRAWAL",
          amount: stroopsToDecimal(amount),
          fromAddress: treasuryAddress,
          toAddress: to,
        });
        return;
      }
      case CONTRACT_EVENT_TOPICS.TRANSFERRED_OUT: {
        const reason = event.topic[2];
        const { spender, to, amount } = event.value as { spender: string; to: string; amount: bigint };
        const type = reason === TRANSFER_OUT_REASON.PAYROLL ? "PAYROLL_DISBURSEMENT" : reason === TRANSFER_OUT_REASON.MILESTONE_FUND ? "MILESTONE_FUND" : null;
        if (!type) {
          this.logger.warn(`Unrecognized transfer_out reason "${String(reason)}" on org ${organizationId}`);
          return;
        }
        await this.repository.upsertTransaction({
          ...base,
          type,
          amount: stroopsToDecimal(amount),
          fromAddress: spender,
          toAddress: to,
        });
        return;
      }
      default:
        this.logger.debug(`No DB effect for ${topicName} on treasury`);
    }
  }

  /**
   * `milestone_engine` is a network-wide singleton, so unlike treasury
   * events (already scoped to one org by which contract emitted them) its
   * events carry `org_id` as their own topic — resolved back to a
   * Postgres `Organization` here rather than passed in by the caller.
   */
  private async handleMilestoneEvent(event: DecodedContractEvent, topicName: string): Promise<void> {
    const statusByTopic: Partial<Record<string, "FUNDED" | "APPROVED" | "RELEASED" | "CANCELLED">> = {
      [CONTRACT_EVENT_TOPICS.MILESTONE_FUNDED]: "FUNDED",
      [CONTRACT_EVENT_TOPICS.MILESTONE_APPROVED]: "APPROVED",
      [CONTRACT_EVENT_TOPICS.MILESTONE_RELEASED]: "RELEASED",
      [CONTRACT_EVENT_TOPICS.MILESTONE_CANCELLED]: "CANCELLED",
    };
    const status = statusByTopic[topicName];
    if (!status) {
      this.logger.debug(`No DB effect for ${topicName} on milestone_engine`);
      return;
    }

    const onChainOrgId = event.topic[1] as bigint;
    const onChainMilestoneId = event.topic[2] as bigint;
    const organizationId = await this.repository.findOrganizationIdByOnChainId(onChainOrgId);
    if (!organizationId) {
      this.logger.warn(`${topicName}: no Organization found for on-chain org ${onChainOrgId}`);
      return;
    }

    await this.repository.updateMilestoneStatusByOnChainId(organizationId, onChainMilestoneId, status);
  }
}
