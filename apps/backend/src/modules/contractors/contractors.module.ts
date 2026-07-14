import { Module } from "@nestjs/common";

import { ContractorsRepository } from "./infra/contractors.repository";
import { ContractorsController } from "./contractors.controller";
import { ContractorsService } from "./contractors.service";

@Module({
  controllers: [ContractorsController],
  providers: [ContractorsService, ContractorsRepository],
})
export class ContractorsModule {}
