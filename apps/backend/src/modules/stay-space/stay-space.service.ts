import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ClientRequestsService, ClientRequestInput } from '../orders/client-requests.service';
import { LodgifyService } from '../lodgify/lodgify.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import {
  cleanGuide,
  dueStep,
  emailKind,
  guideForGuest,
  guideReady,
  Journey,
  message,
  parseStayToken,
  Step,
  STEPS,
  stayLinkOpen,
  stayToken,
  WelcomeGuide,
  whatsappNumber,
  whatsappText,
} from './onboarding';

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
const DAY = 86_400_000;

const STAY_SELECT = {
  id: true, clientId: true, villaId: true, checkIn: true, checkOut: true, guests: true, status: true, label: true, logifyId: true,
  accessVersion: true, invitedAt: true, journey: true,
  client: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  villa: {
    select: {
      id: true, name: true, city: true, address: true, coverImage: true, latitude: true, longitude: true, welcomeGuide: true, parentVillaId: true,
      parentVilla: { select: { id: true, name: true, city: true, address: true, coverImage: true, latitude: true, longitude: true, welcomeGuide: true } },
    },
  },
} as const;

/**
 * Guest onboarding: a booking (Lodgify — Airbnb, Booking… — or direct) gets a personal
 * link to its stay space, without password: the villa's welcome booklet and the services
 * the villa offers, to ask for. The team invites from the booking (e-mail, WhatsApp or
 * copied link); then the journey follows: welcome, J-7 (extras), J-1 (arrival), thanks.
 */
@Injectable()
export class StaySpaceService {
  private readonly logger = new Logger(StaySpaceService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private requests: ClientRequestsService,
    private lodgify: LodgifyService,
    @Optional() private monitoring?: MonitoringService,
  ) {}

  /* ───────────── Loading ───────────── */

  private async stay(id: string) {
    const s = await this.prisma.reservation.findUnique({ where: { id }, select: STAY_SELECT });
    if (!s) throw new NotFoundException('Réservation introuvable');
    return s;
  }

  /** A formula shows its house: name, photo, address and booklet. */
  private house(s: Awaited<ReturnType<StaySpaceService['stay']>>) {
    return s.villa.parentVilla ?? s.villa;
  }

  private guideOf(s: Awaited<ReturnType<StaySpaceService['stay']>>): WelcomeGuide {
    return cleanGuide(this.house(s).welcomeGuide);
  }

  private url(s: { id: string; accessVersion: number }) {
    return `${this.mail.appUrl}/sejour/${stayToken(s.id, s.accessVersion)}`;
  }

  private async servicesCount(villaId: string) {
    return (await this.requests.prices(villaId)).list.length;
  }

  private context(s: Awaited<ReturnType<StaySpaceService['stay']>>, servicesCount: number) {
    return { firstName: s.client.firstName || 'cher voyageur', villa: this.house(s).name, checkIn: s.checkIn, checkOut: s.checkOut, url: this.url(s), guide: this.guideOf(s), servicesCount };
  }

  /* ───────────── Team: the villa's booklet ───────────── */

  async getGuide(villaId: string) {
    const v = await this.prisma.villa.findUnique({ where: { id: villaId }, select: { welcomeGuide: true, parentVillaId: true, parentVilla: { select: { id: true, name: true } } } });
    if (!v) throw new NotFoundException('Villa introuvable');
    const guide = cleanGuide(v.welcomeGuide);
    return { guide, ready: guideReady(guide), usesHouse: v.parentVilla ? { id: v.parentVilla.id, name: v.parentVilla.name } : null, servicesCount: await this.servicesCount(villaId) };
  }

  async saveGuide(villaId: string, input: unknown) {
    const v = await this.prisma.villa.findUnique({ where: { id: villaId }, select: { parentVillaId: true } });
    if (!v) throw new NotFoundException('Villa introuvable');
    if (v.parentVillaId) throw new BadRequestException('Cette annonce est une formule : le livret se remplit sur la maison.');
    await this.prisma.villa.update({ where: { id: villaId }, data: { welcomeGuide: cleanGuide(input) as any } });
    return this.getGuide(villaId);
  }

  /* ───────────── Team: invitation from the booking ───────────── */

  async access(reservationId: string) {
    const s = await this.stay(reservationId);
    const count = await this.servicesCount(s.villaId);
    const ctx = this.context(s, count);
    const journey = (s.journey ?? {}) as Journey;
    const next = dueStep(s.checkIn, s.checkOut, journey);
    const phone = whatsappNumber(s.client.phone);
    const firstStep: Step = next ?? 'welcome';
    return {
      url: ctx.url,
      invitedAt: s.invitedAt,
      journey,
      nextStep: next,
      contact: { email: emailKind(s.client.email) === 'none' ? null : s.client.email, emailKind: emailKind(s.client.email), phone: s.client.phone },
      whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText(firstStep, ctx))}` : null,
      messageText: whatsappText(firstStep, ctx),
      villa: { id: this.house(s).id, name: this.house(s).name },
      guideReady: guideReady(ctx.guide),
      autoMessages: !!ctx.guide.autoMessages,
      servicesCount: count,
      cancelled: s.status === 'CANCELLED',
    };
  }

  /**
   * Invites the guest: updates their e-mail / phone if given, then sends the welcome
   * e-mail (when asked and the address is a real one). The link works at once.
   */
  async invite(reservationId: string, opts: { email?: string; phone?: string; sendEmail?: boolean }) {
    let s = await this.stay(reservationId);
    if (s.status === 'CANCELLED') throw new BadRequestException('Réservation annulée.');
    const data: { email?: string; phone?: string } = {};
    const email = opts.email?.trim().toLowerCase();
    if (email && email !== s.client.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Adresse e-mail invalide.');
      const other = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (other && other.id !== s.clientId) throw new ConflictException('Cette adresse est déjà celle d’une autre fiche : fusionnez les deux fiches (Utilisateurs).');
      data.email = email;
    }
    if (opts.phone !== undefined && opts.phone.trim() !== (s.client.phone ?? '')) data.phone = opts.phone.trim();
    if (Object.keys(data).length) await this.prisma.user.update({ where: { id: s.clientId }, data });

    await this.prisma.reservation.update({ where: { id: s.id }, data: { invitedAt: s.invitedAt ?? new Date() } });
    s = await this.stay(reservationId);
    let emailResult: { sent: boolean; error?: string } | null = null;
    if (opts.sendEmail) {
      const kind = emailKind(s.client.email);
      if (kind === 'none') emailResult = { sent: false, error: 'Pas d’adresse e-mail pour ce voyageur.' };
      else emailResult = await this.sendStep(s, dueStep(s.checkIn, s.checkOut, (s.journey ?? {}) as Journey) ?? 'welcome', 'email');
    }
    return { ...(await this.access(reservationId)), email: emailResult };
  }

  /** Every link sent for this stay stops working; a new one can be sent. */
  async revoke(reservationId: string) {
    await this.stay(reservationId);
    await this.prisma.reservation.update({ where: { id: reservationId }, data: { accessVersion: { increment: 1 } } });
    return this.access(reservationId);
  }

  /** The team sent a step another way (WhatsApp, Airbnb messaging…). */
  async markSent(reservationId: string, step: Step, channel: string) {
    if (!STEPS.includes(step)) throw new BadRequestException('Étape inconnue');
    const s = await this.stay(reservationId);
    const journey = { ...((s.journey ?? {}) as Journey), [step]: { at: new Date().toISOString(), channel: channel.slice(0, 30) } };
    await this.prisma.reservation.update({ where: { id: s.id }, data: { journey: journey as any, invitedAt: s.invitedAt ?? new Date() } });
    return this.access(reservationId);
  }

  private async sendStep(s: Awaited<ReturnType<StaySpaceService['stay']>>, step: Step, channel: 'email' | 'auto') {
    const ctx = this.context(s, await this.servicesCount(s.villaId));
    const m = message(step, ctx);
    const res = await this.mail.sendGuestMessage(s.client.email!, m.subject, m.title, m.lines, { label: m.cta, url: ctx.url });
    if (res.sent) {
      const journey = { ...((s.journey ?? {}) as Journey), [step]: { at: new Date().toISOString(), channel } };
      await this.prisma.reservation.update({ where: { id: s.id }, data: { journey: journey as any, invitedAt: s.invitedAt ?? new Date() } });
    }
    return res;
  }

  /* ───────────── Team: arrivals to welcome ───────────── */

  /** Stays from 3 days ago to `days` ahead, with where each guest is in the journey. */
  async onboarding(days = 30) {
    const now = Date.now();
    const stays = await this.prisma.reservation.findMany({
      where: {
        status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] },
        checkIn: { lte: new Date(now + days * DAY) },
        checkOut: { gte: new Date(now - 4 * DAY) },
      },
      orderBy: { checkIn: 'asc' },
      take: 300,
      select: STAY_SELECT,
    });
    const counts = new Map<string, number>();
    const out = [];
    for (const s of stays) {
      if (!counts.has(s.villaId)) counts.set(s.villaId, await this.servicesCount(s.villaId));
      const ctx = this.context(s, counts.get(s.villaId)!);
      const journey = (s.journey ?? {}) as Journey;
      const next = dueStep(s.checkIn, s.checkOut, journey);
      const phone = whatsappNumber(s.client.phone);
      out.push({
        id: s.id,
        guest: s.label || fullName(s.client),
        villa: this.house(s).name,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        guests: s.guests,
        lodgify: !!s.logifyId,
        contact: { emailKind: emailKind(s.client.email), email: emailKind(s.client.email) === 'none' ? null : s.client.email, phone: s.client.phone },
        invitedAt: s.invitedAt,
        journey,
        nextStep: next,
        // Sent by itself (real e-mail, villa with automatic messages) or to send by hand.
        automatic: !!ctx.guide.autoMessages && emailKind(s.client.email) === 'real',
        whatsappUrl: next && phone ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappText(next, ctx))}` : null,
        messageText: next ? whatsappText(next, ctx) : null,
        guideReady: guideReady(ctx.guide),
        servicesCount: counts.get(s.villaId)!,
      });
    }
    return out;
  }

  /* ───────────── Daily job ───────────── */

  /**
   * Run every morning: reads the new bookings from Lodgify (GET only), then sends the
   * e-mails due today for the villas whose booklet has automatic messages on, to the
   * guests with a real address (never to the platforms' relay addresses).
   */
  async daily() {
    const report = { lodgify: null as null | { synced: number; skipped: number; errors: number }, sent: 0, failed: 0 };
    try {
      const r = await this.lodgify.syncReservations();
      report.lodgify = { synced: r.synced, skipped: r.skipped, errors: r.errors.length };
    } catch (e: any) {
      this.logger.warn(`Synchro Lodgify du matin impossible : ${e?.message}`);
      await this.monitoring?.report('lodgify', `Synchro Lodgify du matin impossible : ${e?.message}`);
    }
    const stays = await this.prisma.reservation.findMany({
      where: { status: { in: ['CONFIRMED', 'ACTIVE', 'COMPLETED'] }, checkIn: { lte: new Date(Date.now() + 60 * DAY) }, checkOut: { gte: new Date(Date.now() - 4 * DAY) } },
      select: STAY_SELECT,
      take: 500,
    });
    for (const s of stays) {
      if (report.sent + report.failed >= 100) break;
      if (emailKind(s.client.email) !== 'real' || !this.guideOf(s).autoMessages) continue;
      const step = dueStep(s.checkIn, s.checkOut, (s.journey ?? {}) as Journey);
      if (!step) continue;
      const res = await this.sendStep(s, step, 'auto');
      if (res.sent) report.sent++;
      else report.failed++;
    }
    return report;
  }

  /* ───────────── Guest ───────────── */

  async resolveKey(key: string | undefined) {
    const t = parseStayToken(key);
    const s = t && (await this.prisma.reservation.findUnique({ where: { id: t.reservationId }, select: STAY_SELECT }));
    if (!s || s.accessVersion !== t!.version) throw new UnauthorizedException('Lien expiré ou désactivé : demandez un nouveau lien à votre conciergerie.');
    if (s.status === 'CANCELLED') throw new UnauthorizedException('Ce séjour a été annulé.');
    if (!stayLinkOpen(s.checkOut)) throw new UnauthorizedException('Ce séjour est terminé depuis plus de deux semaines.');
    return s;
  }

  /** Everything the guest sees: their stay, the booklet, the villa's services, their requests. */
  async guestView(key: string | undefined) {
    const s = await this.resolveKey(key);
    return this.view(s);
  }

  private async view(s: Awaited<ReturnType<StaySpaceService['stay']>>) {
    const house = this.house(s);
    const booklet = guideForGuest(this.guideOf(s), s.checkIn, s.checkOut);
    const catalogue = await this.requests.prices(s.villaId);
    const mine = (await this.requests.mine(s.clientId)).filter((r) => r.reservationId === s.id);
    const mapsQuery = house.latitude != null && house.longitude != null ? `${house.latitude},${house.longitude}` : booklet.guide.address || [house.address, house.city].filter((x) => x && x !== '-').join(', ');
    return {
      guest: { firstName: s.client.firstName },
      stay: {
        id: s.id,
        checkIn: s.checkIn,
        checkOut: s.checkOut,
        nights: s.checkIn && s.checkOut ? Math.round((s.checkOut.getTime() - s.checkIn.getTime()) / DAY) : null,
        guests: s.guests,
      },
      villa: { name: house.name, city: house.city, coverImage: house.coverImage, mapsUrl: mapsQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}` : null },
      booklet,
      catalogue: { currency: catalogue.currency, services: catalogue.list.map(({ unitCost: _c, ...x }) => x) },
      requests: mine,
    };
  }

  async guestRequest(key: string | undefined, input: Omit<ClientRequestInput, 'reservationId'>) {
    const s = await this.resolveKey(key);
    return this.requests.request(s.clientId, { ...input, reservationId: s.id });
  }

  /** For a signed-in client: the booklet of one of their own stays. */
  async clientGuide(clientId: string, reservationId: string) {
    const s = await this.stay(reservationId);
    if (s.clientId !== clientId) throw new NotFoundException('Réservation introuvable');
    return this.view(s);
  }
}
