import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';

@Injectable()
export class ProvidersService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: { page?: number; limit?: number; search?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.search) {
      where.OR = [
        { companyName: { contains: params.search, mode: 'insensitive' } },
        { user: { firstName: { contains: params.search, mode: 'insensitive' } } },
        { user: { lastName: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [providers, total] = await Promise.all([
      this.prisma.provider.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
          categories: { include: { category: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.provider.count({ where }),
    ]);

    return {
      data: providers,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
        categories: { include: { category: true } },
        services: { include: { service: { include: { category: true } } } },
      },
    });
    if (!provider) throw new NotFoundException(`Provider ${id} not found`);
    return provider;
  }

  async create(dto: CreateProviderDto) {
    return this.prisma.provider.create({
      data: dto,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }

  async update(id: string, dto: UpdateProviderDto) {
    await this.findOne(id);
    return this.prisma.provider.update({
      where: { id },
      data: dto,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });
  }
}
