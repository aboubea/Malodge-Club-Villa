import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as pdfParse from 'pdf-parse';

export interface AiResponseDto {
  answer: string;
  sources: {
    documentId: string;
    documentName: string;
    excerpt: string;
  }[];
  hasAnswer: boolean;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private anthropic: Anthropic;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.config.get('ANTHROPIC_API_KEY', ''),
    });
  }

  async query(question: string, userId: string): Promise<AiResponseDto> {
    // Extract keywords (words > 3 chars)
    const keywords = question
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 5);

    // Search documents by keyword matching
    let documents: any[] = [];
    if (keywords.length > 0) {
      const conditions = keywords.map((kw) => ({
        textContent: { contains: kw, mode: 'insensitive' as const },
      }));
      documents = await this.prisma.document.findMany({
        where: { OR: conditions, textContent: { not: null } },
        take: 10,
      });

      // Score each document by keyword match count
      documents = documents
        .map((doc) => {
          const text = (doc.textContent || '').toLowerCase();
          const score = keywords.reduce((acc, kw) => {
            const matches = (text.match(new RegExp(kw, 'g')) || []).length;
            return acc + matches;
          }, 0);
          return { ...doc, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
    }

    if (documents.length === 0) {
      const result: AiResponseDto = {
        answer: "Je ne dispose pas de cette information dans ma base de connaissances.",
        sources: [],
        hasAnswer: false,
      };
      await this.saveQuery(userId, question, result);
      return result;
    }

    const sources = documents.map((doc) => ({
      documentId: doc.id,
      documentName: doc.name,
      excerpt: (doc.textContent as string).substring(0, 300).trim() + '...',
    }));

    const contextStr = documents
      .map((doc, i) => `[Document ${i + 1}: ${doc.name}]\n${(doc.textContent as string).substring(0, 1000)}`)
      .join('\n\n---\n\n');

    const systemPrompt = `Tu es le concierge IA de Malodge Club Villa. Réponds UNIQUEMENT à partir des documents fournis. Si l'information n'est pas dans les documents, réponds: "Je ne dispose pas de cette information dans ma base de connaissances." Ne jamais inventer. Ne jamais chercher sur internet. Cite toujours les sources en indiquant le nom du document.`;

    let answer: string;
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Documents disponibles:\n\n${contextStr}\n\nQuestion: ${question}`,
          },
        ],
      });
      answer = response.content[0].type === 'text' ? response.content[0].text : '';
    } catch (err) {
      this.logger.error('Anthropic API error', err);
      answer = "Je ne dispose pas de cette information dans ma base de connaissances.";
    }

    const hasAnswer = !answer.includes("Je ne dispose pas de cette information");

    const result: AiResponseDto = { answer, sources: hasAnswer ? sources : [], hasAnswer };
    await this.saveQuery(userId, question, result);
    return result;
  }

  private async saveQuery(userId: string, question: string, result: AiResponseDto): Promise<void> {
    try {
      await this.prisma.aiQuery.create({
        data: {
          userId,
          question,
          answer: result.answer,
          sources: result.sources,
          hasAnswer: result.hasAnswer,
        },
      });
    } catch (err) {
      this.logger.error('Failed to save AI query', err);
    }
  }

  async ingestDocument(documentId: string, text: string): Promise<void> {
    await this.prisma.document.update({
      where: { id: documentId },
      data: { textContent: text },
    });
  }

  async extractTextFromPdf(buffer: Buffer): Promise<string> {
    const data = await pdfParse(buffer);
    return data.text;
  }

  async getHistory(userId: string, limit = 20) {
    return this.prisma.aiQuery.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
