import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

/**
 * Polled by Railway/Render's health check mechanism (docs/DEVOPS.md §4).
 * Checks DB connectivity; RPC reachability is added once packages/sdk
 * exists (Step 9).
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: "ok"; db: "ok" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: "error", db: "unreachable" });
    }
    return { status: "ok", db: "ok" };
  }
}
