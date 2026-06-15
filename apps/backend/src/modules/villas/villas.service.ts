import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateVillaDto } from './dto/create-villa.dto';
import { UpdateVillaDto } from './dto/update-villa.dto';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

@Injectable()
export class VillasService {
  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    page?: number;
    limit?: number;
    search?: string;
    city?: string;
    country?: string;
    isActive?: boolean;
    clientId?: string;
    userRole?: string;
    userCountries?: string[];
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    // If clientId provided (CLIENT role), only show villas they have reservations for
    if (params.clientId) {
      where.reservations = { some: { clientId: params.clientId } };
    }
    if (params.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { city: { contains: params.search, mode: 'insensitive' } },
      ];
    }
    if (params.city) where.city = { contains: params.city, mode: 'insensitive' };
    if (params.country) where.country = params.country;
    if (params.isActive !== undefined) where.isActive = params.isActive;

    // Restrict ADMIN/MANAGER to their assigned countries
    if (
      params.userRole && ['ADMIN', 'MANAGER'].includes(params.userRole) &&
      params.userCountries && params.userCountries.length > 0
    ) {
      if (params.country) {
        // Country requested must be in user's countries
        if (!params.userCountries.includes(params.country)) {
          where.country = '__none__'; // force empty result
        }
      } else {
        where.country = { in: params.userCountries };
      }
    }

    const [villas, total] = await Promise.all([
      this.prisma.villa.findMany({
        where,
        skip,
        take: limit,
        include: {
          managers: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
          _count: { select: { reservations: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.villa.count({ where }),
    ]);

    return {
      data: villas,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const villa = await this.prisma.villa.findUnique({
      where: { id },
      include: {
        managers: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        reservations: {
          take: 10,
          orderBy: { checkIn: 'desc' },
          include: { client: { select: { id: true, firstName: true, lastName: true, email: true } } },
        },
        villaServices: { include: { service: { include: { category: true } } } },
        documents: true,
      },
    });
    if (!villa) throw new NotFoundException(`Villa ${id} not found`);
    return villa;
  }

  async create(dto: CreateVillaDto) {
    let slug = slugify(dto.name);
    const existing = await this.prisma.villa.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    return this.prisma.villa.create({
      data: {
        ...dto,
        slug,
        amenities: dto.amenities || [],
        rules: dto.rules || [],
        images: dto.images || [],
      },
    });
  }

  async update(id: string, dto: UpdateVillaDto) {
    await this.findOne(id);
    return this.prisma.villa.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.villa.delete({ where: { id } });
    return { message: 'Villa deleted successfully' };
  }
}
