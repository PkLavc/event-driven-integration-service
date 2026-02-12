import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookJobService } from './webhook-job.service';
import { Job } from 'bullmq';

@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private prisma: PrismaService,
    private webhookJobService: WebhookJobService,
  ) {}

  async process(job: Job): Promise<void> {
    const { eventId } = job.data;

    this.logger.log(`Processing webhook event: ${eventId}`);

    // Get event
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Update status to processing
    await this.prisma.event.update({
      where: { id: eventId },
      data: { status: 'PROCESSING' },
    });

    try {
      // Process based on provider and event type
      await this.processEvent(event);

      // Mark as completed
      await this.prisma.event.update({
        where: { id: eventId },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
        },
      });

      this.logger.log(`Event ${eventId} processed successfully`);
    } catch (error) {
      this.logger.error(`Error processing event ${eventId}:`, error);

      const retryCount = event.retryCount + 1;
      const maxRetries = event.maxRetries;

      if (retryCount >= maxRetries) {
        // Move to dead letter queue
        await this.prisma.event.update({
          where: { id: eventId },
          data: { status: 'DEAD_LETTER' },
        });
        await this.webhookJobService.moveToDeadLetter(job);
        this.logger.error(`Event ${eventId} moved to dead letter queue`);
      } else {
        // Schedule retry
        await this.prisma.event.update({
          where: { id: eventId },
          data: {
            retryCount,
            nextRetryAt: new Date(Date.now() + Math.pow(2, retryCount) * 1000), // Exponential backoff
          },
        });
        throw error; // Let BullMQ handle retry
      }
    }
  }

  private async processEvent(event: any) {
    // Simulate processing based on event type
    switch (event.eventType) {
      case 'payment.succeeded':
        this.logger.log(`Processing payment success: ${event.payload.amount}`);
        // Send email, update database, etc.
        break;
      case 'order.created':
        this.logger.log(`Processing order creation: ${event.payload.orderId}`);
        break;
      case 'user.created':
        this.logger.log(`Processing user creation: ${event.payload.userId}`);
        break;
      default:
        this.logger.log(`Processing generic event: ${event.eventType}`);
    }

    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}