import { Controller, HttpCode, HttpStatus, InternalServerErrorException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookReceiverService } from './webhook-receiver.service';

type RawBodyRequest = Request & {
  rawBody?: Buffer;
};

@Controller('shodai/webhooks')
export class WebhookReceiverController {
  constructor(private readonly receiver: WebhookReceiverService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async receive(@Req() request: RawBodyRequest): Promise<void> {
    if (!request.rawBody) {
      throw new InternalServerErrorException('Raw request body is required for webhook signature verification');
    }
    await this.receiver.receive(request.rawBody, request.headers);
  }
}
