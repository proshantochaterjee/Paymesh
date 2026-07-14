import { Module } from "@nestjs/common";

import { AnalyticsChainAdapter } from "./infra/analytics-chain.adapter";
import { AnalyticsRepository } from "./infra/analytics.repository";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRepository, AnalyticsChainAdapter],
})
export class AnalyticsModule {}
