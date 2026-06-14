import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  async sendSms(to: string, body: string): Promise<void> {
    this.logger.log(`[SMS stub] To: ${to} | Body: ${body}`);
  }

  async sendWhatsApp(to: string, body: string): Promise<void> {
    this.logger.log(`[WhatsApp stub] To: ${to} | Body: ${body}`);
  }
}
