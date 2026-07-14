import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { configSchema } from "./config.schema";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => configSchema.parse(env),
    }),
  ],
})
export class AppConfigModule {}
