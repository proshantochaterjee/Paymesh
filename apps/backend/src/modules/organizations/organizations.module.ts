import { Module } from "@nestjs/common";

import { IntentRepository } from "../../common/intent/intent.repository";
import { IntentService } from "../../common/intent/intent.service";
import { OrganizationsChainAdapter } from "./infra/organizations-chain.adapter";
import { OrganizationsRepository } from "./infra/organizations.repository";
import { OrganizationsController } from "./organizations.controller";
import { OrganizationsService } from "./organizations.service";

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsRepository, OrganizationsChainAdapter, IntentService, IntentRepository],
})
export class OrganizationsModule {}
