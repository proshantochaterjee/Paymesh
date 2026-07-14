import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";

import { IndexerService } from "./indexer.service";

export const INDEXER_QUEUE_NAME = "indexer";
export const INDEXER_POLL_JOB_NAME = "poll";

/**
 * docs/EVENT_INDEXING.md §3: interval-based polling via a BullMQ
 * repeatable job (not a persistent streaming subscription) — the
 * repeatable job itself is scheduled once in `IndexerModule.onModuleInit`.
 */
@Processor(INDEXER_QUEUE_NAME)
export class IndexerProcessor extends WorkerHost {
  constructor(private readonly indexerService: IndexerService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== INDEXER_POLL_JOB_NAME) return;
    await this.indexerService.pollAll();
  }
}
