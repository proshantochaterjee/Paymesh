import { Module } from "@nestjs/common";

import { IntentRepository } from "../../common/intent/intent.repository";
import { IntentService } from "../../common/intent/intent.service";
import { EmployeesChainAdapter } from "./infra/employees-chain.adapter";
import { EmployeesRepository } from "./infra/employees.repository";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeesRepository, EmployeesChainAdapter, IntentService, IntentRepository],
})
export class EmployeesModule {}
