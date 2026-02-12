import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { WebhookProcessor } from './webhook.processor';

@Injectable()
export class WebhookJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookJobService.name);
  private webhookQueue: Queue;
  private deadLetterQueue: Queue;
  private worker: Worker;
  private deadLetterWorker: Worker;
  private queueEvents: QueueEvents;

  constructor(private webhookProcessor: WebhookProcessor) {}

  async onModuleInit() {
    // Initialize queues
    this.webhookQueue = new Queue('webhook-processing', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    });

    this.deadLetterQueue = new Queue('dead-letter', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    });

    // Initialize worker
    this.worker = new Worker('webhook-processing', async (job) => {
      return this.webhookProcessor.process(job);
    }, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    });

    // Initialize dead letter worker
    this.deadLetterWorker = new Worker('dead-letter', async (job) => {
      this.logger.error(`Dead letter job: ${job.id}`, job.data);
    }, {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    });

    // Queue events
    this.queueEvents = new QueueEvents('webhook-processing', {
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    });

    this.queueEvents.on('completed', ({ jobId }) => {
      this.logger.log(`Job ${jobId} completed`);
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }) => {
      this.logger.error(`Job ${jobId} failed: ${failedReason}`);
    });
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.deadLetterWorker.close();
    await this.webhookQueue.close();
    await this.deadLetterQueue.close();
    await this.queueEvents.close();
  }

  async queueWebhookProcessing(eventId: string) {
    await this.webhookQueue.add('process-webhook', { eventId }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  async moveToDeadLetter(job: any) {
    await this.deadLetterQueue.add('dead-letter', job.data);
  }
}