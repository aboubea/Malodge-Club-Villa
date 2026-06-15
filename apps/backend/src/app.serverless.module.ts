import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { VillasModule } from './modules/villas/villas.module';
import { ServicesModule } from './modules/services/services.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { MailModule } from './modules/mail/mail.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { FinanceModule } from './modules/finance/finance.module';
import { AiModule } from './modules/ai/ai.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SettingsModule } from './modules/settings/settings.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { ChatRestModule } from './modules/chat/chat.rest.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// ChatRestModule provides REST-only chat endpoints (no WebSocket — not supported in serverless).
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    VillasModule,
    ServicesModule,
    ReservationsModule,
    ProvidersModule,
    MailModule,
    OrdersModule,
    PaymentsModule,
    FinanceModule,
    AiModule,
    DocumentsModule,
    NotificationsModule,
    SettingsModule,
    DashboardModule,
    ChatRestModule,
    CalendarModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppServerlessModule {}
