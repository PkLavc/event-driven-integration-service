import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { JobsModule } from './jobs/jobs.module';
import { HealthModule } from './health/health.module';
import { WinstonLoggerService } from './common/winston-logger.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    WebhooksModule,
    JobsModule,
    HealthModule,
    TerminusModule,
  ],
  providers: [WinstonLoggerService],
})
export class AppModule {}