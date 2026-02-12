import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookJobService } from '../jobs/webhook-job.service';
import { Provider } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaService,
    private webhookJobService: WebhookJobService,
  ) {}

  async handleWebhook(provider: Provider, eventId: string, eventType: string, payload: any, signature?: string) {
    // Validate signature
    this.validateSignature(provider, payload, signature);

    // Check idempotency
    const existingEvent = await this.prisma.event.findUnique({
      where: { provider_eventId: { provider, eventId } },
    });

    if (existingEvent) {
      this.logger.log(`Event ${eventId} already processed`);
      return { status: 'already_processed' };
    }

    // Create event record
    const event = await this.prisma.event.create({
      data: {
        provider,
        eventId,
        eventType,
        payload,
        signature,
        status: 'PENDING',
      },
    });

    // Queue for processing
    await this.webhookJobService.queueWebhookProcessing(event.id);

    this.logger.log(`Webhook queued for processing: ${event.id}`);
    return { status: 'queued', eventId: event.id };
  }

  private validateSignature(provider: Provider, payload: any, signature?: string) {
    if (!signature) {
      throw new BadRequestException('Missing signature');
    }

    const secret = this.getWebhookSecret(provider);
    const expectedSignature = this.generateSignature(provider, payload, secret);

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      throw new BadRequestException('Invalid signature');
    }
  }

  private getWebhookSecret(provider: Provider): string {
    switch (provider) {
      case 'STRIPE':
        return process.env.STRIPE_WEBHOOK_SECRET;
      case 'PAYPAL':
        return process.env.PAYPAL_WEBHOOK_SECRET;
      case 'GITHUB':
        return process.env.GITHUB_WEBHOOK_SECRET;
      default:
        throw new BadRequestException('Unsupported provider');
    }
  }

  private generateSignature(provider: Provider, payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }
}