import "./common/bigint-json.polyfill";

import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { AppConfigModule } from "./config/config.module";
import { AppLoggingModule } from "./common/logging/logging.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { AuthModule } from "./modules/auth/auth.module";
import { ContractorsModule } from "./modules/contractors/contractors.module";
import { EmployeesModule } from "./modules/employees/employees.module";
import { IndexerModule } from "./modules/indexer/indexer.module";
import { MilestonesModule } from "./modules/milestones/milestones.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { PayrollModule } from "./modules/payroll/payroll.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { TreasuryModule } from "./modules/treasury/treasury.module";

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    // docs/SECURITY_MODEL.md §6: 100 req/min per IP default; AuthController
    // overrides specific unauthenticated /auth/* routes to 10 req/min.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 100 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    OrganizationsModule,
    TreasuryModule,
    EmployeesModule,
    ContractorsModule,
    PayrollModule,
    MilestonesModule,
    TransactionsModule,
    AnalyticsModule,
    IndexerModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
