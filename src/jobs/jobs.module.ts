import { Module } from '@nestjs/common';
import { WebhookJobService } from './webhook-job.service';
import { WebhookProcessor } from './webhook.processor';

@Module({
  providers: [WebhookJobService, WebhookProcessor],
  exports: [WebhookJobService],
})
export class JobsModule {}