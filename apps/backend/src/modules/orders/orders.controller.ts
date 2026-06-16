import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto, AssignProviderDto } from './dto/update-order.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role, OrderStatus } from '@malodge/shared';

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get('stats')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Get order statistics — MANAGER+ only' })
  getStats() {
    return this.ordersService.getStats();
  }

  @Get('provider-confirm')
  @Public()
  @ApiOperation({ summary: 'Provider confirms or rejects availability — no auth required' })
  providerConfirm(
    @Query('orderId') orderId: string,
    @Query('action') action: 'accept' | 'reject',
  ) {
    return this.ordersService.providerRespond(orderId, action);
  }

  @Get()
  @ApiOperation({ summary: 'List orders — CLIENT sees only their own' })
  findAll(
    @CurrentUser() user: { id: string; role: string; countries?: string[] },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: OrderStatus,
    @Query('villaId') villaId?: string,
    @Query('clientId') clientId?: string,
    @Query('search') search?: string,
    @Query('country') country?: string,
  ) {
    return this.ordersService.findAll({
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      status,
      villaId,
      clientId: user.role === Role.CLIENT ? user.id : clientId,
      search,
      country,
      userRole: user.role,
      userCountries: user.countries || [],
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with all relations' })
  findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new order — CLIENT auto-assigns themselves' })
  create(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreateOrderDto,
  ) {
    const clientId = user.role === Role.CLIENT ? user.id : (dto.clientId ?? user.id);
    return this.ordersService.create({ ...dto, clientId });
  }

  @Patch(':id/status')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Update order status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Patch(':id/provider')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Assign provider to order' })
  assignProvider(@Param('id') id: string, @Body() dto: AssignProviderDto) {
    return this.ordersService.assignProvider(id, dto.providerId);
  }

  @Delete(':id')
  @Roles(Role.MANAGER)
  @ApiOperation({ summary: 'Cancel an order' })
  cancel(@Param('id') id: string) {
    return this.ordersService.cancel(id);
  }
}
