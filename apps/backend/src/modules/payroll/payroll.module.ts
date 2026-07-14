import { Module } from "@nestjs/common";

import { IntentRepository } from "../../common/intent/intent.repository";
import { IntentService } from "../../common/intent/intent.service";
import { PayrollChainAdapter } from "./infra/payroll-chain.adapter";
import { PayrollRepository } from "./infra/payroll.repository";
import { PayrollController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, PayrollRepository, PayrollChainAdapter, IntentService, IntentRepository],
})
export class PayrollModule {}
