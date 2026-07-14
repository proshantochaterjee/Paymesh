import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import type { ReqId } from "pino-http";

import type { AppConfig } from "../../config/config.schema";

// docs/LOGGING.md: structured JSON (pino) via nestjs-pino, correlationId
// propagated from X-Request-Id (generated if absent), redaction for
// auth/session material. Signed-XDR-at-debug-only (§4) is a call-site
// discipline (services must call .debug(), not .info(), when logging XDR)
// rather than something this module structurally enforces.
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        pinoHttp: {
          level: config.get("NODE_ENV") === "production" ? "info" : "debug",
          transport:
            config.get("NODE_ENV") === "production"
              ? undefined
              : { target: "pino-pretty", options: { singleLine: true } },
          genReqId: (req: IncomingMessage): ReqId =>
            (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
          customProps: (req: IncomingMessage & { id?: ReqId }) => ({ correlationId: req.id }),
          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              "req.body.password",
              "res.headers['set-cookie']",
            ],
            censor: "[redacted]",
          },
        },
      }),
    }),
  ],
  exports: [LoggerModule],
})
export class AppLoggingModule {}
