import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { AppConfig } from "../../config/config.schema";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AUTH_INSTANCE } from "./lib/auth.constants";
import { buildAuthInstance } from "./lib/better-auth.provider";

// Global: AuthGuard (apps/backend/src/common/guards/auth.guard.ts) is used
// by every future domain module's controllers, so AUTH_INSTANCE is
// registered once here rather than re-imported per module — mirrors
// PrismaModule's existing global pattern.
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: AUTH_INSTANCE,
      useFactory: (prisma: PrismaService, config: ConfigService<AppConfig, true>) =>
        buildAuthInstance(prisma, config),
      inject: [PrismaService, ConfigService],
    },
  ],
  exports: [AuthService, AUTH_INSTANCE],
})
export class AuthModule {}
