import { Module } from "@nestjs/common";

import { IntentRepository } from "../../common/intent/intent.repository";
import { IntentService } from "../../common/intent/intent.service";
import { TreasuryChainAdapter } from "./infra/treasury-chain.adapter";
import { TreasuryRepository } from "./infra/treasury.repository";
import { TreasuryController } from "./treasury.controller";
import { TreasuryService } from "./treasury.service";

@Module({
  controllers: [TreasuryController],
  providers: [TreasuryService, TreasuryRepository, TreasuryChainAdapter, IntentService, IntentRepository],
})
export class TreasuryModule {}
