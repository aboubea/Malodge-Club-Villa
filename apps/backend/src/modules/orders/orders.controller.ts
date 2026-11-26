import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto, AssignProviderDto } from './dto/update-order.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role, OrderStatus } from '@malodge/shared';
import { ClientRequestsService } from './client-requests.service';

/** Internal extras data (purchase cost, seller) never leaves the staff side. */
function stripInternal<T>(data: T, role: string): T {
  if ([Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER].includes(role as Role)) return data;
  const clean = (order: any) => {
    if (!order || typeof order !== 'object') return order;
    // The provider's WhatsApp message carries their signed accept/refuse links: team only.
    const { sellerId: _seller, whatsappUrl: _wa, ...rest } = order;
    if (Array.isArray(rest.items)) {
      rest.items = rest.items.map(({ unitCost: _cost, ...item }: any) => item);
    }
    return rest;
  };
  const anyData = data as any;
  if (Array.isArray(anyData)) return anyData.map(clean) as T;
  if (anyData && Array.isArray(anyData.data)) return { ...anyData, data: anyData.data.map(clean) };
  return clean(anyData);
}

@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(
    private ordersService: OrdersService,
    private clientRequests: ClientRequestsService,
  ) {}

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
    @Query('t') signature: string,
  ) {
    return this.ordersService.providerRespond(orderId, action, signature);
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
    }).then((r) => stripInternal(r, user.role));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID with all relations' })
  async findOne(@Param('id') id: string, @CurrentUser() user: { role: string }) {
    return stripInternal(await this.ordersService.findOne(id), user.role);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new order — CLIENT auto-assigns themselves' })
  async create(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: CreateOrderDto,
  ) {
    // A client asks; the server prices it (their browser's price is ignored) and the team confirms.
    if (user.role === Role.CLIENT) {
      return this.clientRequests.request(user.id, {
        reservationId: dto.reservationId,
        scheduledAt: dto.scheduledAt,
        notes: dto.notes,
        items: (dto.items ?? []).map((i) => ({ serviceId: i.serviceId, quantity: Math.round(i.quantity), notes: i.notes })),
      });
    }
    // Anybody else (providers…) does not create orders.
    if (![Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER].includes(user.role as Role)) throw new ForbiddenException();
    const clientId = dto.clientId ?? user.id;
    return stripInternal(await this.ordersService.create({ ...dto, clientId }), user.role);
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
