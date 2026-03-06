import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookJobService } from './webhook-job.service';
import { Job } from 'bullmq';
import { trace, SpanStatusCode, SpanKind } from '@opentelemetry/api';

@Injectable()
export class WebhookProcessor {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private prisma: PrismaService,
    private webhookJobService: WebhookJobService,
  ) {}

  async process(job: Job): Promise<void> {
    const { eventId } = job.data;

    const tracer = trace.getTracer('webhook-processor', '1.0.0');
    
    return tracer.startActiveSpan('process-webhook-event', {
      kind: SpanKind.INTERNAL,
      attributes: {
        'event.id': eventId,
        'event.type': job.data.eventType || 'unknown',
        'event.provider': job.data.provider || 'unknown',
        'job.id': job.id || 'unknown',
      }
    }, async (span) => {
      try {
        this.logger.log(`Processing webhook event: ${eventId}`);

        const event = await this.prisma.event.findUnique({
          where: { id: eventId },
        });

        if (!event) {
          span.recordException(new Error(`Event ${eventId} not found`));
          span.setStatus({ code: SpanStatusCode.ERROR, message: 'Event not found' });
          throw new Error(`Event ${eventId} not found`);
        }

        span.setAttributes({
          'event.type': event.eventType,
          'event.provider': event.provider,
          'event.status': event.status,
          'event.retry_count': event.retryCount,
        });

        await this.prisma.event.update({
          where: { id: eventId },
          data: { status: 'PROCESSING' },
        });

        await this.processEvent(event);

        await this.prisma.event.update({
          where: { id: eventId },
          data: {
            status: 'COMPLETED',
            processedAt: new Date(),
          },
        });

        this.logger.log(`Event ${eventId} processed successfully`);
        
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        
      } catch (error) {
        this.logger.error(`Error processing event ${eventId}:`, error);
        
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        
        const event = await this.prisma.event.findUnique({
          where: { id: eventId },
        });

        if (event) {
          const retryCount = event.retryCount + 1;
          const maxRetries = event.maxRetries;

          if (retryCount >= maxRetries) {
            await this.prisma.event.update({
              where: { id: eventId },
              data: { status: 'DEAD_LETTER' },
            });
            await this.webhookJobService.moveToDeadLetter(job);
            this.logger.error(`Event ${eventId} moved to dead letter queue`);
            span.addEvent('moved_to_dead_letter');
          } else {
            await this.prisma.event.update({
              where: { id: eventId },
              data: {
                retryCount,
                nextRetryAt: new Date(Date.now() + Math.pow(2, retryCount) * 1000),
              },
            });
            span.addEvent('scheduled_retry', {
              'retry.count': retryCount,
              'retry.max': maxRetries,
            });
            throw error;
          }
        }
        
        span.end();
      }
    });
  }

  private validatePayload(event: any): void {
    if (!event.payload) {
      throw new Error('Event payload is missing');
    }

    if (event.eventType === 'payment.succeeded' || event.eventType === 'payment.failed') {
      if (!event.payload.amount || typeof event.payload.amount !== 'number' || event.payload.amount <= 0) {
        throw new Error(`Invalid payment amount: ${event.payload.amount}`);
      }
      if (!event.payload.currency || typeof event.payload.currency !== 'string') {
        throw new Error('Missing or invalid currency in payment event');
      }
    }

    if (event.eventType === 'order.created') {
      if (!event.payload.orderId || typeof event.payload.orderId !== 'string') {
        throw new Error('Missing or invalid orderId in order event');
      }
    }

    if (event.eventType === 'user.created') {
      if (!event.payload.userId || typeof event.payload.userId !== 'string') {
        throw new Error('Missing or invalid userId in user event');
      }
    }
  }

  private async processEvent(event: any) {
    this.validatePayload(event);

    switch (event.eventType) {
      case 'payment.succeeded':
        this.logger.log(`Processing payment success: ${event.payload.amount}`);
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

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}