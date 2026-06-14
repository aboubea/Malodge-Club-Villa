import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@malodge/shared';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post()
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Create a payment for an order' })
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(dto);
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Confirm a manual payment' })
  confirm(@Param('id') id: string) {
    return this.paymentsService.confirmPayment(id);
  }

  @Post(':id/refund')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Refund a payment' })
  refund(@Param('id') id: string) {
    return this.paymentsService.refund(id);
  }

  @Get('order/:orderId')
  @ApiOperation({ summary: 'Get payment for a specific order' })
  findByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.findByOrder(orderId);
  }
}
