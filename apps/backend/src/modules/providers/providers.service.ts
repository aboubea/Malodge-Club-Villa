import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProviderDto } from './dto/create-provider.dto';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { InviteProviderDto } from './dto/invite-provider.dto';

const PROVIDER_INCLUDE = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatar: true } },
  categories: { include: { category: true } },
} as const;

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
        { user: { email: { contains: params.search, mode: 'insensitive' } } },
      ];
    }

    const [providers, total] = await Promise.all([
      this.prisma.provider.findMany({
        where,
        skip,
        take: limit,
        include: PROVIDER_INCLUDE,
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
        ...PROVIDER_INCLUDE,
        services: { include: { service: { include: { category: true } } } },
      },
    });
    if (!provider) throw new NotFoundException(`Provider ${id} not found`);
    return provider;
  }

  async create(dto: CreateProviderDto) {
    return this.prisma.provider.create({
      data: dto,
      include: PROVIDER_INCLUDE,
    });
  }

  async inviteProvider(dto: InviteProviderDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email.');

    const hashedPassword = await bcrypt.hash(Math.random().toString(36).slice(-8) + 'A1!', 12);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          role: 'PROVIDER',
          isActive: true,
        },
      });

      const provider = await tx.provider.create({
        data: {
          userId: user.id,
          companyName: dto.companyName,
          siret: dto.siret,
          iban: dto.iban,
        },
      });

      if (dto.categoryIds?.length) {
        await tx.providerCategory.createMany({
          data: dto.categoryIds.map((categoryId) => ({ providerId: provider.id, categoryId })),
          skipDuplicates: true,
        });
      }

      return tx.provider.findUnique({
        where: { id: provider.id },
        include: PROVIDER_INCLUDE,
      });
    });
  }

  async update(id: string, dto: UpdateProviderDto) {
    await this.findOne(id);
    const { categoryIds, ...providerData } = dto;

    return this.prisma.$transaction(async (tx) => {
      await tx.provider.update({ where: { id }, data: providerData });

      if (categoryIds !== undefined) {
        await tx.providerCategory.deleteMany({ where: { providerId: id } });
        if (categoryIds.length > 0) {
          await tx.providerCategory.createMany({
            data: categoryIds.map((categoryId) => ({ providerId: id, categoryId })),
            skipDuplicates: true,
          });
        }
      }

      return tx.provider.findUnique({
        where: { id },
        include: PROVIDER_INCLUDE,
      });
    });
  }
}
