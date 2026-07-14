import { Module } from "@nestjs/common";

import { IntentRepository } from "../../common/intent/intent.repository";
import { IntentService } from "../../common/intent/intent.service";
import { MilestonesChainAdapter } from "./infra/milestones-chain.adapter";
import { MilestonesRepository } from "./infra/milestones.repository";
import { MilestonesController } from "./milestones.controller";
import { MilestonesService } from "./milestones.service";

@Module({
  controllers: [MilestonesController],
  providers: [MilestonesService, MilestonesRepository, MilestonesChainAdapter, IntentService, IntentRepository],
})
export class MilestonesModule {}
