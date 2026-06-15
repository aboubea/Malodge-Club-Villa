import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceDto, CreateServiceCategoryDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

@Injectable()
export class ServicesService {
  constructor(private prisma: PrismaService) {}

  async findAllServices(params: { page?: number; limit?: number; search?: string; categoryId?: string }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params.search) {
      where.name = { contains: params.search, mode: 'insensitive' };
    }
    if (params.categoryId) where.categoryId = params.categoryId;

    const [services, total] = await Promise.all([
      this.prisma.service.findMany({
        where,
        skip,
        take: limit,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.service.count({ where }),
    ]);

    return {
      data: services,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneService(id: string) {
    const service = await this.prisma.service.findUnique({
      where: { id },
      include: {
        category: true,
        villaServices: { include: { villa: { select: { id: true, name: true, city: true } } } },
        providers: { include: { provider: { include: { user: { select: { firstName: true, lastName: true } } } } } },
      },
    });
    if (!service) throw new NotFoundException(`Service ${id} not found`);
    return service;
  }

  async createService(dto: CreateServiceDto) {
    let slug = slugify(dto.name);
    const existing = await this.prisma.service.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    return this.prisma.service.create({
      data: { ...dto, slug, images: dto.images || [] },
      include: { category: true },
    });
  }

  async updateService(id: string, dto: UpdateServiceDto) {
    await this.findOneService(id);
    return this.prisma.service.update({ where: { id }, data: dto, include: { category: true } });
  }

  async removeService(id: string) {
    await this.findOneService(id);
    await this.prisma.service.delete({ where: { id } });
    return { message: 'Service deleted successfully' };
  }

  async findAllCategories() {
    return this.prisma.serviceCategory.findMany({
      where: { isActive: true },
      include: { _count: { select: { services: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async ensureDefaultCategories() {
    const count = await this.prisma.serviceCategory.count();
    if (count > 0) return;

    const defaults = [
      { name: 'Ménage & Entretien', slug: 'menage-entretien' },
      { name: 'Transport & Transfert', slug: 'transport-transfert' },
      { name: 'Bien-être & Spa', slug: 'bien-etre-spa' },
      { name: 'Restauration & Traiteur', slug: 'restauration-traiteur' },
      { name: 'Activités & Loisirs', slug: 'activites-loisirs' },
      { name: 'Conciergerie', slug: 'conciergerie' },
      { name: 'Sécurité & Gardiennage', slug: 'securite-gardiennage' },
      { name: 'Maintenance Technique', slug: 'maintenance-technique' },
    ];

    await this.prisma.serviceCategory.createMany({ data: defaults, skipDuplicates: true });
  }

  async createCategory(dto: CreateServiceCategoryDto) {
    let slug = slugify(dto.name);
    const existing = await this.prisma.serviceCategory.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Category already exists');

    return this.prisma.serviceCategory.create({ data: { ...dto, slug } });
  }

  async assignProvider(serviceId: string, providerId: string, isPreferred = false) {
    await this.findOneService(serviceId);
    return this.prisma.serviceProvider.upsert({
      where: { serviceId_providerId: { serviceId, providerId } },
      create: { serviceId, providerId, isPreferred },
      update: { isPreferred },
      include: {
        provider: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
  }

  async removeProvider(serviceId: string, providerId: string) {
    await this.prisma.serviceProvider.delete({
      where: { serviceId_providerId: { serviceId, providerId } },
    });
    return { message: 'Provider removed from service' };
  }
}
