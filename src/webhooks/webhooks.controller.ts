import { Controller, Post, Param, Body, Headers, Logger } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { Provider } from '@prisma/client';

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Post(':provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers('stripe-signature') stripeSignature?: string,
    @Headers('paypal-signature') paypalSignature?: string,
    @Headers('x-hub-signature-256') githubSignature?: string,
  ) {
    const providerEnum = provider.toUpperCase() as Provider;
    const eventId = payload.id || payload.event_id || payload.idempotency_key;
    const eventType = payload.type || payload.event_type;

    let signature: string | undefined;
    switch (providerEnum) {
      case 'STRIPE':
        signature = stripeSignature;
        break;
      case 'PAYPAL':
        signature = paypalSignature;
        break;
      case 'GITHUB':
        signature = githubSignature;
        break;
    }

    this.logger.log(`Received webhook from ${provider}: ${eventType}`);

    return this.webhooksService.handleWebhook(providerEnum, eventId, eventType, payload, signature);
  }
}