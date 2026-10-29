import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '@/config/env.validation.js';
import { DatabaseModule } from '@/database/database.module.js';
import { HealthModule } from '@/health/health.module.js';
import { LoggerModule } from '@/logger/logger.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule,
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
