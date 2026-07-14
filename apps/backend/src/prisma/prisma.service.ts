import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import type { AppConfig } from "../config/config.schema";

/**
 * Prisma 7 requires a driver adapter rather than reading `DATABASE_URL`
 * implicitly (docs/DATABASE_SCHEMA.md's schema.prisma no longer has a
 * `datasource.url` — see that file's header comment).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<AppConfig, true>) {
    const adapter = new PrismaPg({ connectionString: config.get("DATABASE_URL") });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
