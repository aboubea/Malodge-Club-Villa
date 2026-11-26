import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { secretsStatus } from '../../common/security/secrets';

/**
 * Incident journal: server errors, Lodgify failures and e-mails not sent are recorded
 * (AuditLog, action INCIDENT), grouped by kind and message over 24 h with a counter,
 * and shown in "Contrôle des données". A new incident e-mails the administrators
 * (at most 10 alerts a day; e-mail failures are never e-mailed about).
 */
export type IncidentKind = 'api' | 'lodgify' | 'mail';

export const INCIDENT = 'INCIDENT';
const ALERT = 'INCIDENT_ALERT';
const DAY = 86_400_000;
const MAX_ALERTS_PER_DAY = 10;

export interface IncidentContext {
  route?: string;
  status?: number;
  stack?: string;
  detail?: string;
}

/** Same problem, same fingerprint: ids, numbers and addresses do not count. */
export function fingerprint(kind: IncidentKind, message: string, route?: string) {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\S+@\S+/g, '@')
      .replace(/\b[0-9a-z]{20,}\b/g, ':id')
      .replace(/\d+/g, '#')
      .slice(0, 300);
  return createHash('sha1')
    .update(`${kind}|${norm(message)}|${norm((route ?? '').split('?')[0])}`)
    .digest('hex')
    .slice(0, 20);
}

const KIND_LABEL: Record<IncidentKind, string> = { api: 'Erreur serveur', lodgify: 'Lodgify', mail: 'E-mail non envoyé' };

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('délai dépassé')), ms))]);

@Injectable()
export class MonitoringService {
  private readonly logger = new Logger('Monitoring');

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {
    // E-mails that fail are journaled too (the mail service does not depend on this one).
    mail.onFailure = (what, error) => void this.report('mail', `${what} : ${error}`);
  }

  /** Records an incident; never throws and never holds a request for more than ~2 s. */
  async report(kind: IncidentKind, message: string, ctx: IncidentContext = {}) {
    try {
      const isNew = await withTimeout(this.save(kind, message, ctx), 2_000);
      if (isNew && kind !== 'mail') await withTimeout(this.alert(kind, message, ctx), 4_000);
    } catch (e: any) {
      this.logger.warn(`Incident non enregistré (${e?.message}) : ${message}`);
    }
  }

  private async save(kind: IncidentKind, message: string, ctx: IncidentContext): Promise<boolean> {
    const fp = fingerprint(kind, message, ctx.route);
    const now = new Date().toISOString();
    const existing = await this.prisma.auditLog.findFirst({
      where: { action: INCIDENT, entityId: fp, createdAt: { gt: new Date(Date.now() - DAY) } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      const c = (existing.changes ?? {}) as Record<string, any>;
      await this.prisma.auditLog.update({ where: { id: existing.id }, data: { changes: { ...c, message: message.slice(0, 1000), count: (c.count ?? 1) + 1, lastSeen: now } } });
      return false;
    }
    await this.prisma.auditLog.create({
      data: {
        action: INCIDENT,
        entity: kind,
        entityId: fp,
        changes: {
          message: message.slice(0, 1000),
          route: ctx.route ?? null,
          status: ctx.status ?? null,
          detail: ctx.detail?.slice(0, 500) ?? null,
          stack: ctx.stack?.split('\n').slice(0, 8).join('\n') ?? null,
          count: 1,
          firstSeen: now,
          lastSeen: now,
        },
      },
    });
    return true;
  }

  /** E-mails the administrators about a new incident. */
  private async alert(kind: IncidentKind, message: string, ctx: IncidentContext) {
    const sentToday = await this.prisma.auditLog.count({ where: { action: ALERT, createdAt: { gt: new Date(Date.now() - DAY) } } });
    if (sentToday >= MAX_ALERTS_PER_DAY) return;
    const configured = (process.env.ALERT_EMAIL ?? '').split(/[,;\s]+/).filter((x) => x.includes('@'));
    const admins = configured.length
      ? configured
      : (
          await this.prisma.user.findMany({
            where: { role: { in: ['SUPER_ADMIN', 'ADMIN'] }, isActive: true, canLogin: true },
            select: { email: true },
          })
        )
          .map((u) => u.email)
          .filter((e) => e && !/\.(invalid|local)$/i.test(e));
    if (!admins.length) return;
    await this.prisma.auditLog.create({ data: { action: ALERT, entity: kind, entityId: fingerprint(kind, message, ctx.route) } });
    for (const to of admins.slice(0, 5)) {
      await this.mail.sendAlert(to, `${KIND_LABEL[kind]} : ${message.slice(0, 80)}`, [
        ['Type', KIND_LABEL[kind]],
        ['Message', message],
        ['Requête', ctx.route ?? '—'],
        ['Heure', new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Casablanca' })],
      ]);
    }
  }

  /** Incidents of the last days and the security checks, for the admin panel. */
  async overview(days = 14) {
    const rows = await this.prisma.auditLog.findMany({
      where: { action: INCIDENT, createdAt: { gt: new Date(Date.now() - days * DAY) } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, entity: true, changes: true, createdAt: true },
    });
    const incidents = rows
      .map((r) => {
        const c = (r.changes ?? {}) as Record<string, any>;
        return {
          id: r.id,
          kind: r.entity as IncidentKind,
          message: String(c.message ?? ''),
          route: c.route ?? null,
          status: c.status ?? null,
          count: Number(c.count ?? 1),
          firstSeen: c.firstSeen ?? r.createdAt.toISOString(),
          lastSeen: c.lastSeen ?? r.createdAt.toISOString(),
        };
      })
      .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    const mail = this.mail.status();
    return {
      incidents,
      checks: {
        ...secretsStatus(),
        mailConfigured: mail.configured,
        mailSenderIsDefault: mail.fromIsDefault,
        alertRecipients: (process.env.ALERT_EMAIL ?? '').trim() ? 'ALERT_EMAIL' : 'administrateurs',
      },
    };
  }
}
