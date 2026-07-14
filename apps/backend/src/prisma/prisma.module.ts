import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service";

// Global: every domain module's infra/*.repository.ts (docs/BACKEND_ARCHITECTURE.md
// §1) injects PrismaService, so it's registered once here rather than
// re-imported per module.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
