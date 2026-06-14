import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { CreateDocumentDto, UpdateDocumentDto } from './dto/create-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  async findAll(query: { page?: number; limit?: number; category?: string; villaId?: string; search?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.category) where.category = query.category;
    if (query.villaId) where.villaId = query.villaId;
    if (query.search) where.name = { contains: query.search, mode: 'insensitive' };

    const [items, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { villa: { select: { id: true, name: true } } },
      }),
      this.prisma.document.count({ where }),
    ]);

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const doc = await this.prisma.document.findUnique({
      where: { id },
      include: { villa: { select: { id: true, name: true } } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async create(dto: CreateDocumentDto, uploadedBy?: string) {
    const doc = await this.prisma.document.create({
      data: {
        name: dto.name,
        type: dto.type,
        fileUrl: dto.fileUrl,
        villaId: dto.villaId,
        fileSize: dto.fileSize,
        category: dto.category || 'general',
        uploadedBy,
        textContent: dto.textContent,
      },
      include: { villa: { select: { id: true, name: true } } },
    });

    // Auto-ingest if textContent provided
    if (dto.textContent) {
      await this.aiService.ingestDocument(doc.id, dto.textContent).catch(() => {});
    }

    return doc;
  }

  async update(id: string, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.prisma.document.update({
      where: { id },
      data: dto,
      include: { villa: { select: { id: true, name: true } } },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.prisma.document.delete({ where: { id } });
    return { success: true };
  }

  async incrementVersion(id: string) {
    await this.findOne(id);
    return this.prisma.document.update({
      where: { id },
      data: { version: { increment: 1 } },
    });
  }

  async ingestForAI(id: string) {
    const doc = await this.findOne(id);
    if (doc.textContent) {
      await this.aiService.ingestDocument(id, doc.textContent);
    }
    return { success: true, documentId: id };
  }
}
