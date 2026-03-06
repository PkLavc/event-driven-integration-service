import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { WebhookProcessor } from './webhook.processor';

@Injectable()
export class WebhookJobService {
  private webhookQueue: Queue;
  private deadLetterQueue: Queue;
  private worker: Worker;
  private deadLetterWorker: Worker;
  private queueEvents: QueueEvents;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private webhookProcessor: WebhookProcessor,
  ) {
    const redisConnection = {
      host: this.configService.get('REDIS_HOST'),
      port: parseInt(this.configService.get('REDIS_PORT')),
    };

    this.webhookQueue = new Queue('webhook-processing', {
      connection: redisConnection,
    });
    
    this.deadLetterQueue = new Queue('dead-letter', {
      connection: redisConnection,
    });

    this.worker = new Worker('webhook-processing', async (job) => {
      return this.webhookProcessor.process(job);
    }, {
      connection: redisConnection,
      concurrency: 5,
    });

    this.deadLetterWorker = new Worker('dead-letter', async (job) => {
      Logger.error(`Dead letter job: ${job.id}`, job.data);
      return { success: false };
    }, {
      connection: redisConnection,
    });

    this.queueEvents = new QueueEvents('webhook-processing', {
      connection: redisConnection,
    });

    this.setupQueueEvents();
  }

  async queueWebhookProcessing(eventId: string): Promise<void> {
    await this.webhookQueue.add('process-webhook', { eventId }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: 10,
      removeOnFail: 5,
    });
  }

  async moveToDeadLetter(job: any): Promise<void> {
    await this.deadLetterQueue.add('dead-letter-job', job.data, {
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  }

  private setupQueueEvents() {
    this.queueEvents.on('completed', (job) => {
      Logger.log(`Job ${job.jobId} completed`);
    });

    this.queueEvents.on('failed', (job, error) => {
      Logger.error(`Job ${job?.jobId} failed: ${error}`);
    });
  }
}