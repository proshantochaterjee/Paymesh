import { BullModule, InjectQueue } from "@nestjs/bullmq";
import { Module, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";

import type { AppConfig } from "../../config/config.schema";
import { IndexerChainAdapter } from "./infra/indexer-chain.adapter";
import { IndexerRepository } from "./infra/indexer.repository";
import { INDEXER_POLL_JOB_NAME, INDEXER_QUEUE_NAME, IndexerProcessor } from "./indexer.processor";
import { IndexerService } from "./indexer.service";

const INDEXER_POLL_INTERVAL_MS = 5_000;

// No controller: the indexer has no public HTTP surface, it runs as a
// BullMQ processor in this same application context (docs/BACKEND_ARCHITECTURE.md
// §2, docs/EVENT_INDEXING.md).
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        connection: { url: configService.get("REDIS_URL", { infer: true }) },
      }),
    }),
    BullModule.registerQueue({ name: INDEXER_QUEUE_NAME }),
  ],
  providers: [IndexerService, IndexerRepository, IndexerChainAdapter, IndexerProcessor],
})
export class IndexerModule implements OnModuleInit {
  constructor(@InjectQueue(INDEXER_QUEUE_NAME) private readonly queue: Queue) {}

  /**
   * docs/EVENT_INDEXING.md §3: registers the repeatable polling job once at
   * boot. A fixed `jobId` makes this idempotent across restarts — BullMQ
   * dedupes repeatable jobs by their repeat key, so re-registering the
   * same schedule on every app start doesn't pile up duplicate jobs.
   */
  async onModuleInit(): Promise<void> {
    await this.queue.add(
      INDEXER_POLL_JOB_NAME,
      {},
      { repeat: { every: INDEXER_POLL_INTERVAL_MS }, jobId: "indexer-poll" },
    );
  }
}
