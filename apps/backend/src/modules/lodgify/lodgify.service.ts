import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as https from 'https';
import { extractCapacity } from './lodgify-capacity';
import { currencyForCountry } from '../../common/money';
import { canonicalCountry } from '../../common/geo';
import { FxService } from '../fx/fx.service';
import { convertVillaCurrency } from '../fx/convert-villa';
import { MonitoringService } from '../monitoring/monitoring.service';

/** Number of guests of a Lodgify booking, whatever the API version. */
export function bookingGuests(r: any): number | null {
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : typeof v === 'string' && /^\d+$/.test(v.trim()) && +v > 0 ? +v : null);
  const direct = n(r?.people_count) ?? n(r?.guests_count) ?? n(r?.people) ?? n(r?.number_of_guests) ?? n(r?.guests);
  if (direct) return direct;
  const breakdown = (b: any) => {
    if (!b || typeof b !== 'object') return null;
    const total = ['adults', 'children', 'infants'].reduce((s, k) => s + (n(b[k]) ?? 0), 0);
    return total > 0 ? total : null;
  };
  const rooms: any[] = Array.isArray(r?.rooms) ? r.rooms : [];
  const fromRooms = rooms.reduce((s, room) => s + (n(room?.people) ?? breakdown(room?.guest_breakdown) ?? 0), 0);
  return fromRooms > 0 ? fromRooms : breakdown(r?.guest_breakdown);
}

@Injectable()
export class LodgifyService {
  private readonly logger = new Logger(LodgifyService.name);

  constructor(
    private prisma: PrismaService,
    private fx: FxService,
    @Optional() private monitoring?: MonitoringService,
  ) {}

  private async getApiKey(): Promise<string | null> {
    const setting = await this.prisma.appSetting.findUnique({ where: { key: 'lodgify_api_key' } });
    const raw = setting ? String((setting.value as any) || '') : null;
    return raw ? raw.trim() : null;
  }

  async saveApiKey(apiKey: string) {
    await this.prisma.appSetting.upsert({
      where: { key: 'lodgify_api_key' },
      update: { value: apiKey as any },
      create: { key: 'lodgify_api_key', value: apiKey as any },
    });
    return { success: true };
  }

  async getApiKeyStatus(): Promise<{ configured: boolean }> {
    const key = await this.getApiKey();
    return { configured: !!key && key.length > 0 };
  }

  /** The only call ever made to Lodgify: a read (HTTP GET). Nothing is created, changed or deleted there. */
  private async lodgifyGet(path: string, extraHeaders: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.lodgify.com',
        path,
        method: 'GET',
        headers: { 'Accept': 'application/json', ...extraHeaders },
      };
      const fail = (message: string, status = 0) => reject(Object.assign(new Error(message), { status }));
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status === 401 || status === 403) {
            return fail(`Clé API Lodgify invalide ou non autorisée (HTTP ${status})`, status);
          }
          if (status >= 400) {
            const preview = data.slice(0, 200).replace(/\s+/g, ' ');
            return fail(`Lodgify HTTP ${status}: ${preview}`, status);
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            const preview = data.slice(0, 200).replace(/\s+/g, ' ');
            fail(`Réponse Lodgify non-JSON (HTTP ${status}): ${preview}`, status);
          }
        });
      });
      req.setTimeout(12_000, () => req.destroy(new Error('délai dépassé')));
      req.on('error', (err) => fail(`Erreur réseau Lodgify: ${err.message}`));
      req.end();
    });
  }

  private authHeaders(apiKey: string): Record<string, string>[] {
    return [
      { 'X-ApiKey': apiKey },
      { 'Authorization': `Bearer ${apiKey}` },
      { 'Authorization': apiKey },
    ];
  }

  /** Index of the authentication header Lodgify accepted last, tried first next time. */
  private authIndex = 0;

  private async lodgifyGetAny(path: string, apiKey: string): Promise<any> {
    const headers = this.authHeaders(apiKey);
    const order = [this.authIndex, ...headers.keys()].filter((i, pos, all) => all.indexOf(i) === pos);
    const errors: string[] = [];
    for (const i of order) {
      try {
        const result = await this.lodgifyGet(path, headers[i]);
        this.authIndex = i;
        return result;
      } catch (e: any) {
        errors.push(`[${JSON.stringify(Object.keys(headers[i]))}] ${e?.message}`);
        // Only a refused key is worth another header; a missing page stays missing.
        if (e?.status !== 401 && e?.status !== 403) break;
      }
    }
    throw new Error(errors.join(' | '));
  }

  private async lodgifyProbe(paths: string[], apiKey: string): Promise<any> {
    const errors: string[] = [];
    for (const path of paths) {
      try {
        const result = await this.lodgifyGetAny(path, apiKey);
        this.logger.log(`Lodgify: endpoint OK → ${path}`);
        return result;
      } catch (e: any) {
        this.logger.warn(`Lodgify: endpoint failed (${path}): ${e?.message}`);
        errors.push(`${path}: ${e?.message}`);
      }
    }
    throw new Error(`Aucun endpoint Lodgify ne répond:\n${errors.join('\n')}`);
  }

  /**
   * Bookings read from Lodgify (GET only), page after page: the same source for
   * the "Lodgify" tab and for the sync, so both always agree.
   */
  private async fetchBookings(apiKey: string): Promise<any[]> {
    const SIZE = 50;
    const seen = new Set<string>();
    const all: any[] = [];
    // Bookings from Airbnb, Booking.com… ("external") are included; current, upcoming and past
    // stays are read separately so the upcoming ones are never cut off by older pages.
    // Every page is read, whatever order Lodgify lists the bookings in: a stay that ended
    // yesterday must never fall off the end of the list (past stays used to be cut at 300).
    const pass = async (filter: string, maxPages: number) => {
      const url = (page: number) => `/v2/reservations/bookings?page=${page}&size=${SIZE}&includeCount=true&includeExternal=true&stayFilter=${filter}`;
      const first = await this.lodgifyGetAny(url(1), apiKey);
      const got: any[] = [...this.itemsOf(first)];
      const count = Number(first?.count);
      if (Number.isFinite(count) && count > SIZE) {
        const pages = Math.ceil(count / SIZE);
        // Beyond the limit, both ends of the list (the newest are at one of them).
        const wanted =
          pages <= maxPages
            ? Array.from({ length: pages - 1 }, (_, i) => i + 2)
            : [...Array.from({ length: maxPages / 2 - 1 }, (_, i) => i + 2), ...Array.from({ length: maxPages / 2 }, (_, i) => pages - maxPages / 2 + 1 + i)];
        for (let i = 0; i < wanted.length; i += 6) {
          const batch = await Promise.all(wanted.slice(i, i + 6).map((p) => this.lodgifyGetAny(url(p), apiKey)));
          batch.forEach((d) => got.push(...this.itemsOf(d)));
        }
      } else if (!Number.isFinite(count)) {
        // No count given: page by page until a short page.
        let last = this.itemsOf(first);
        for (let page = 2; page <= maxPages && last.length === SIZE; page++) {
          last = this.itemsOf(await this.lodgifyGetAny(url(page), apiKey));
          got.push(...last);
        }
      }
      return got;
    };
    try {
      const passes = await Promise.all([pass('Current', 4), pass('Upcoming', 30), pass('Historic', 40)]);
      for (const b of passes.flat()) {
        if (b?.id == null || seen.has(String(b.id))) continue;
        seen.add(String(b.id));
        all.push(b);
      }
      if (all.length) return all;
    } catch (e: any) {
      this.logger.warn(`Lodgify: lecture filtrée des réservations indisponible (${e?.message}), lecture simple`);
    }
    try {
      for (let page = 1; page <= 20; page++) {
        const data = await this.lodgifyGetAny(`/v2/reservations/bookings?page=${page}&size=${SIZE}&includeCount=true&includeExternal=true`, apiKey);
        const items = this.itemsOf(data);
        const fresh = items.filter((b) => b?.id != null && !seen.has(String(b.id)));
        fresh.forEach((b) => seen.add(String(b.id)));
        all.push(...fresh);
        if (items.length < SIZE || fresh.length === 0) break;
      }
      if (all.length) return all;
    } catch (e: any) {
      this.logger.warn(`Lodgify: réservations paginées indisponibles (${e?.message}), essai des autres endpoints`);
    }
    const from = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const to = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    const data = await this.lodgifyProbe([
      `/v2/reservations/bookings?dateFrom=${from}&dateTo=${to}`,
      `/v2/reservations/bookings`,
      `/v1/reservation/booking`,
      `/v1/reservation?dateFrom=${from}&dateTo=${to}`,
      `/rental-api/v2/reservations/bookings`,
    ], apiKey);
    return this.itemsOf(data);
  }

  /** A Lodgify booking in the app's terms (null for a calendar block, which is not a stay). */
  private mapBooking(r: any) {
    const status = String(r.status ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (['unavailable', 'blocked', 'closed', 'ownerblock', 'block'].includes(status)) return null;
    const day = (v: any) => {
      if (!v) return null;
      const m = String(v).match(/^(\d{4}-\d{2}-\d{2})/);
      const d = m ? new Date(`${m[1]}T00:00:00.000Z`) : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const checkIn = day(r.arrival ?? r.arrival_date ?? r.date_arrival ?? r.check_in);
    const checkOut = day(r.departure ?? r.departure_date ?? r.date_departure ?? r.check_out);
    const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
    let appStatus: 'PENDING' | 'CONFIRMED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' =
      ['declined', 'cancelled', 'canceled', 'deleted', 'rejected'].includes(status)
        ? 'CANCELLED'
        : ['booked', 'confirmed', 'checkin', 'checkout', 'paid'].includes(status)
          ? 'CONFIRMED'
          : 'PENDING';
    // A confirmed stay under way or over is shown as such.
    if (appStatus === 'CONFIRMED' && checkIn && checkOut) {
      if (checkOut < today) appStatus = 'COMPLETED';
      else if (checkIn <= today) appStatus = 'ACTIVE';
    }
    const currency = r.currency_code ?? r.currency;
    // Where the booking was made: Airbnb, Booking.com, the Lodgify website (direct)…
    const rawSource = String(r.source_text ?? r.source ?? '').trim();
    const src = rawSource.toLowerCase();
    const channel = !rawSource
      ? null
      : src.includes('airbnb')
        ? 'Airbnb'
        : src.includes('booking')
          ? 'Booking.com'
          : src.includes('vrbo') || src.includes('homeaway') || src.includes('abritel')
            ? 'Vrbo / Abritel'
            : src.includes('expedia')
              ? 'Expedia'
              : ['manual', 'website', 'oh', 'direct', 'widget', 'bookingengine'].some((k) => src.includes(k))
                ? 'Direct'
                : rawSource;
    return {
      id: String(r.id),
      channel,
      propertyId: String(r.property_id ?? r.propertyId ?? r.property?.id ?? ''),
      propertyName: r.property_name ?? r.property?.name ?? null,
      guestName: (r.guest?.name ?? r.requester_name ?? '').trim() || 'Client Lodgify',
      guestEmail: r.guest?.email ?? null,
      guestPhone: r.guest?.phone ?? null,
      checkIn,
      checkOut,
      guests: bookingGuests(r) ?? 1,
      totalAmount: parseFloat(r.total_amount ?? r.amount ?? r.price ?? 0) || 0,
      currency: typeof currency === 'string' && /^[a-z]{3}$/i.test(currency) ? currency.toUpperCase() : null,
      lodgifyStatus: r.status ?? 'unknown',
      // An enquiry or quote ("Open") is a request, not a stay: often a second record next to the real booking.
      enquiry: ['open', 'enquiry', 'inquiry', 'quote', 'request'].includes(status),
      status: appStatus,
      notes: r.notes ?? null,
    };
  }

  /** Listing names (id → name), kept 6 h in the database: to name listings not yet in the app. */
  private async listingNames(): Promise<Record<string, string>> {
    const KEY = 'lodgify.listingNames';
    try {
      const row = (await this.prisma.appSetting.findUnique({ where: { key: KEY } }))?.value as { at: number; names: Record<string, string> } | undefined;
      if (row && Date.now() - row.at < 6 * 3600_000) return row.names;
    } catch { /* read Lodgify */ }
    const apiKey = await this.getApiKey();
    if (!apiKey) return {};
    try {
      const items = await this.fetchPropertyList(apiKey);
      const names = Object.fromEntries(items.filter((p) => p?.id != null).map((p) => [String(p.id), String(p.name ?? `Annonce ${p.id}`)]));
      const value = { at: Date.now(), names } as any;
      await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
      return names;
    } catch {
      return {};
    }
  }

  /** Adds the chosen Lodgify listings to the app (read from Lodgify, written only to the app). */
  async importListings(ids: string[]) {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');
    const wanted = new Set(ids.map(String));
    const items = (await this.fetchPropertyList(apiKey)).filter((p) => wanted.has(String(p?.id)));
    const broken = new Map<string, number>();
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    const started = Date.now();
    for (const p of items) {
      try {
        // Details (rooms, capacity) while time allows; the list entry otherwise.
        const extra = Date.now() - started < 15_000 ? await this.fetchPropertyDetails(String(p.id), apiKey, broken, Array.isArray(p.rooms) ? p.rooms : []) : undefined;
        const r = await this.saveProperty(this.mapProperty(p, extra));
        if (r.created) created++;
        else updated++;
      } catch (e: any) {
        errors.push(`${p.name ?? p.id} : ${e?.message}`);
      }
    }
    this.bookingCache = null;
    return { created, updated, missing: [...wanted].filter((id) => !items.some((p) => String(p.id) === id)), errors };
  }

  /** Bookings kept a few minutes, so browsing the calendar does not hit Lodgify on every click. */
  private bookingCache: { at: number; items: NonNullable<ReturnType<LodgifyService['mapBooking']>>[] } | null = null;

  private async cachedBookings(force = false) {
    const TTL = force ? 0 : 5 * 60_000;
    if (this.bookingCache && Date.now() - this.bookingCache.at < TTL) return this.bookingCache.items;
    type Booking = NonNullable<ReturnType<LodgifyService['mapBooking']>>;
    // Shared by every server instance (kept in the database), so a cold start does not re-read Lodgify.
    const KEY = 'lodgify.bookingsCache';
    const revive = (b: any): Booking => ({ ...b, checkIn: b.checkIn ? new Date(b.checkIn) : null, checkOut: b.checkOut ? new Date(b.checkOut) : null });
    try {
      const row = (await this.prisma.appSetting.findUnique({ where: { key: KEY } }))?.value as { at: number; items: any[] } | undefined;
      if (row && Date.now() - row.at < TTL) {
        this.bookingCache = { at: row.at, items: row.items.map(revive) };
        return this.bookingCache.items;
      }
    } catch { /* no shared cache: read Lodgify */ }
    const apiKey = await this.getApiKey();
    if (!apiKey) return [];
    const items = (await this.fetchBookings(apiKey)).map((r) => this.mapBooking(r)).filter(Boolean) as Booking[];
    this.bookingCache = { at: Date.now(), items };
    try {
      const value = { at: this.bookingCache.at, items } as any;
      await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
    } catch { /* non-fatal */ }
    return items;
  }

  /**
   * Lodgify bookings of a period, read live (GET only) and shaped like the app's
   * stays, for the calendar: those already copied into the app are left out
   * (the app shows its own copy), so every booking appears exactly once.
   */
  async calendarBookings(from: Date, to: Date, countries: string[] = [], force = false) {
    const configured = await this.getApiKey();
    if (!configured) return { configured: false, bookings: [], unknownProperties: [] as { id: string; name: string; bookings: number }[] };
    const before = this.bookingCache?.at ?? 0;
    const bookings = await this.cachedBookings(force);
    let copied: Awaited<ReturnType<LodgifyService['copyBookings']>> | null = null;
    if ((this.bookingCache?.at ?? 0) !== before && Date.now() - (this.bookingCache?.at ?? 0) < 10_000) {
      try {
        copied = await this.copyBookings(bookings);
      } catch (e: any) {
        this.logger.warn(`Lodgify: copie des réservations dans l’appli impossible (${e?.message})`);
        await this.monitoring?.report('lodgify', `Copie des réservations Lodgify impossible : ${e?.message}`);
      }
    }
    const villas = await this.prisma.villa.findMany({
      where: { logifyId: { not: null }, ...(countries.length ? { country: { in: countries } } : {}) },
      select: { id: true, name: true, city: true, coverImage: true, currency: true, logifyId: true },
    });
    const villaByListing = new Map(villas.map((v) => [v.logifyId!, v]));
    const inApp = new Set(
      (await this.prisma.reservation.findMany({ where: { logifyId: { in: bookings.map((b) => b.id) } }, select: { logifyId: true } })).map((r) => r.logifyId!),
    );
    const unknown = new Map<string, number>();
    const out = [];
    for (const b of bookings) {
      if (!b.checkIn || !b.checkOut || b.checkIn > to || b.checkOut < from || inApp.has(b.id)) continue;
      const v = villaByListing.get(b.propertyId);
      if (!v) {
        if (!countries.length) unknown.set(b.propertyId, (unknown.get(b.propertyId) ?? 0) + 1);
        continue;
      }
      const [firstName, ...rest] = b.guestName.split(/\s+/);
      out.push({
        id: `lodgify-${b.id}`,
        logifyId: b.id,
        live: true,
        enquiry: b.enquiry,
        channel: b.channel,
        label: b.guestName,
        checkIn: b.checkIn.toISOString(),
        checkOut: b.checkOut.toISOString(),
        status: b.status,
        totalAmount: b.totalAmount,
        currency: b.currency,
        guests: b.guests,
        source: 'lodgify',
        notes: b.notes,
        villaId: v.id,
        villa: { id: v.id, name: v.name, city: v.city, coverImage: v.coverImage, currency: v.currency },
        client: { id: '', firstName, lastName: rest.join(' '), email: b.guestEmail, phone: b.guestPhone },
        _count: { orders: 0 },
      });
    }
    const inWindow = bookings.filter((b) => b.checkIn && b.checkOut && b.checkIn <= to && b.checkOut >= from);
    return {
      configured: true,
      bookings: out,
      // Listings not in the app, named, with how many bookings they hold.
      unknownProperties: unknown.size
        ? await this.listingNames().then((names) => [...unknown].map(([id, bookings]) => ({ id, name: names[id] ?? `Annonce ${id}`, bookings })))
        : [],
      // What was read, to check nothing is missing.
      stats: {
        read: bookings.length,
        external: bookings.filter((b) => b.channel && b.channel !== 'Direct').length,
        inPeriod: inWindow.length,
        readAt: new Date(this.bookingCache?.at ?? Date.now()).toISOString(),
        copied: copied?.synced ?? null,
      },
    };
  }

  async listReservations(): Promise<any[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');
    const items = await this.fetchBookings(apiKey);
    return items
      .map((r) => this.mapBooking(r))
      .filter(Boolean)
      .map((b) => ({ ...b!, checkIn: b!.checkIn?.toISOString() ?? null, checkOut: b!.checkOut?.toISOString() ?? null, status: b!.lodgifyStatus, source: 'lodgify' }));
  }

  /* ─────────────────────────────── Properties ─────────────────────────────── */

  private itemsOf(data: any): any[] {
    if (Array.isArray(data)) return data;
    const items = data?.items ?? data?.data ?? data?.rooms ?? data?.room_types;
    return Array.isArray(items) ? items : [];
  }

  /** Every listing, page after page (Lodgify serves them 50 at a time). */
  private async fetchPropertyList(apiKey: string): Promise<any[]> {
    const SIZE = 50;
    const all: any[] = [];
    const seen = new Set<string>();
    try {
      for (let page = 1; page <= 20; page++) {
        const data = await this.lodgifyGetAny(`/v2/properties?page=${page}&size=${SIZE}`, apiKey);
        const items = this.itemsOf(data);
        const fresh = items.filter((p) => !seen.has(String(p?.id)));
        fresh.forEach((p) => seen.add(String(p?.id)));
        all.push(...fresh);
        // Stop on a short page, or when the paging parameters are ignored and the same page comes back.
        if (items.length < SIZE || fresh.length === 0) break;
      }
      if (all.length) return all;
    } catch (e: any) {
      this.logger.warn(`Lodgify: liste paginée indisponible (${e?.message}), essai des autres endpoints`);
    }
    const data = await this.lodgifyProbe([
      `/v2/properties`,
      `/v1/property`,
      `/rental-api/property`,
      `/rental-api/properties`,
      `/rental-api/v2/properties`,
    ], apiKey);
    return this.itemsOf(data);
  }

  /**
   * The property itself and its room types, where Lodgify keeps the capacity,
   * bedrooms and bathrooms. Reads only; an endpoint that keeps failing is
   * skipped for the rest of the run.
   */
  private async fetchPropertyDetails(
    id: string,
    apiKey: string,
    broken: Map<string, number>,
    listRooms: any[] = [],
  ): Promise<{ detail: any | null; rooms: any[]; calls: Record<string, string> }> {
    const calls: Record<string, string> = {};
    const get = async (name: string, path: string) => {
      if ((broken.get(name) ?? 0) >= 3) return null;
      try {
        const data = await this.lodgifyGetAny(path, apiKey);
        broken.set(name, -1000); // works: never give up on it
        calls[path] = 'ok';
        return data;
      } catch (e: any) {
        broken.set(name, (broken.get(name) ?? 0) + 1);
        calls[path] = String(e?.message ?? e).slice(0, 160);
        return null;
      }
    };

    const enc = encodeURIComponent(id);
    const [detail, roomList] = await Promise.all([
      get('detail', `/v2/properties/${enc}`),
      get('rooms', `/v2/properties/${enc}/rooms`),
    ]);

    // Room types by id, the most detailed version of each winning.
    const rooms = new Map<string, any>();
    const add = (r: any) => {
      if (!r || typeof r !== 'object') return;
      const key = String(r.id ?? r.room_type_id ?? rooms.size);
      rooms.set(key, { ...(rooms.get(key) ?? {}), ...r });
    };
    listRooms.forEach(add);
    (Array.isArray(detail?.rooms) ? detail.rooms : []).forEach(add);
    this.itemsOf(roomList).forEach(add);

    // Room types listed without their figures: read each one (a villa has one or two).
    const list = [...rooms.values()];
    const bare = list.filter((r) => r.id != null && extractCapacity({ properties: [], rooms: [r], texts: [] }).source.maxGuests === null);
    if (bare.length && bare.length <= 4) {
      const full = await Promise.all(bare.map((r) => get('room', `/v2/properties/${enc}/rooms/${encodeURIComponent(String(r.id))}`)));
      full.forEach(add);
    }
    return { detail, rooms: [...rooms.values()], calls };
  }

  /** The app's view of a listing, from its list entry plus, when read, its detail and room types. */
  private mapProperty(p: any, extra?: { detail: any | null; rooms: any[] }) {
    const d = extra?.detail ?? {};
    const src = { ...p, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== '')) };

    const imgs: any[] = src.images ?? src.photos ?? [];
    const coverImage =
      imgs[0]?.url ?? imgs[0]?.src ?? imgs[0]?.large_url ?? imgs[0]?.thumb_url ??
      src.image_url ?? src.main_image ?? src.image ?? null;
    const allImages: string[] = imgs
      .map((i: any) => (typeof i === 'string' ? i : i?.url ?? i?.src ?? i?.large_url ?? i?.thumb_url))
      .filter(Boolean);

    const str = (v: any) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const country =
      str(src.location?.country) ?? str(src.location?.country_name) ?? str(src.address?.country) ??
      str(src.address?.country_name) ?? str(src.country) ?? str(src.country_name) ?? null;
    const address =
      str(src.address?.street) ?? str(src.address?.full) ?? str(src.address?.line1) ?? str(src.address) ?? null;
    const description = str(src.description) ?? str(src.about) ?? null;

    const roomsFromList = Array.isArray(p.rooms) ? p.rooms : [];
    const capacity = extractCapacity({
      properties: [extra?.detail, p].filter(Boolean),
      rooms: extra?.rooms?.length ? extra.rooms : roomsFromList,
      texts: [src.name, description, ...(extra?.rooms ?? roomsFromList).map((r: any) => `${r?.name ?? ''} ${r?.description ?? ''}`)],
    });

    return {
      id: String(p.id),
      name: str(src.name) ?? `Property ${p.id}`,
      description,
      city: str(src.location?.city) ?? str(src.address?.city) ?? str(src.city) ?? '',
      country,
      address,
      maxGuests: capacity.maxGuests,
      bedrooms: capacity.bedrooms,
      bathrooms: capacity.bathrooms,
      /** Where each figure comes from: Lodgify field, room types, or the listing's text. */
      capacitySource: capacity.source,
      coverImage,
      images: allImages,
      isActive: src.is_active ?? true,
      lodgifyUrl: src.website_url ?? src.url ?? null,
    };
  }

  /**
   * Listings read from Lodgify, with capacity, bedrooms and bathrooms taken from
   * each property and its room types. Past `budgetMs`, the remaining listings
   * keep what the list itself says, so the request stays within the server's
   * time limit.
   */
  async listProperties(opts: { budgetMs?: number } = {}): Promise<any[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');
    const started = Date.now();
    const budget = opts.budgetMs ?? 15_000;

    const items = (await this.fetchPropertyList(apiKey)).filter((p) => p && typeof p === 'object' && p.id != null);
    const broken = new Map<string, number>();
    const out: any[] = new Array(items.length);
    let next = 0;
    let skipped = 0;
    const worker = async () => {
      while (next < items.length) {
        const i = next++;
        const p = items[i];
        if (Date.now() - started > budget) {
          skipped++;
          out[i] = this.mapProperty(p);
          continue;
        }
        const extra = await this.fetchPropertyDetails(String(p.id), apiKey, broken, Array.isArray(p.rooms) ? p.rooms : []);
        out[i] = this.mapProperty(p, extra);
      }
    };
    await Promise.all(Array.from({ length: Math.min(6, items.length) }, worker));
    if (skipped) this.logger.warn(`Lodgify: ${skipped} logement(s) lus sans leur détail (temps écoulé)`);
    const missing = out.filter((p) => p.bedrooms === null || p.maxGuests === null).length;
    this.logger.log(`Lodgify: ${out.length} logement(s) lus en ${Date.now() - started} ms, ${missing} sans chambres ou voyageurs`);
    return out;
  }

  /** What Lodgify returns for one listing, and what the app reads from it (debug). */
  async getRawFirstProperty(id?: string): Promise<any> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');
    const items = await this.fetchPropertyList(apiKey);
    const first = (id ? items.find((p) => String(p?.id) === String(id)) : null) ?? items[0] ?? null;
    if (!first) return { totalCount: 0, keys: [], occupancyFields: {}, raw: null };
    const extra = await this.fetchPropertyDetails(String(first.id), apiKey, new Map(), Array.isArray(first.rooms) ? first.rooms : []);
    const mapped = this.mapProperty(first, extra);
    return {
      totalCount: items.length,
      keys: [...new Set([...Object.keys(first), ...Object.keys(extra.detail ?? {})])],
      occupancyFields: {
        retenu: { voyageurs: mapped.maxGuests, chambres: mapped.bedrooms, sallesDeBain: mapped.bathrooms },
        source: mapped.capacitySource,
        appels: extra.calls,
      },
      raw: { liste: first, detail: extra.detail, typesDeChambre: extra.rooms },
    };
  }

  /** Lodgify listings not in the app yet (names read with GET, cached 6 h). */
  async missingListings() {
    const configured = !!(await this.getApiKey());
    if (!configured) return { configured, listings: [] as { id: string; name: string }[] };
    const [names, synced] = await Promise.all([this.listingNames(), this.getSyncedIds()]);
    const have = new Set(synced);
    const listings = Object.entries(names)
      .filter(([id]) => !have.has(id))
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    return { configured, listings };
  }

  async getSyncedIds(): Promise<string[]> {
    const villas = await this.prisma.villa.findMany({ where: { logifyId: { not: null } }, select: { logifyId: true } });
    return villas.map((v) => v.logifyId!);
  }

  /**
   * Copies a Lodgify listing into the app (the local copy only; Lodgify is never written to).
   * A figure Lodgify does not give is left as it is, never replaced by a made-up value.
   */
  async saveProperty(prop: {
    id: string; name: string; city: string; country: string | null;
    address: string | null; maxGuests: number | null; bedrooms: number | null;
    bathrooms: number | null; coverImage: string | null; description: string | null;
  }, opts: { matchByName?: boolean } = {}): Promise<{ villaId: string; created: boolean }> {
    const lodgifyId = String(prop.id);
    const name = (prop.name || `Property ${lodgifyId}`).trim();
    const count = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : null);
    const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

    const known: Record<string, unknown> = {
      maxGuests: count(prop.maxGuests),
      bedrooms: count(prop.bedrooms),
      bathrooms: count(prop.bathrooms),
      address: text(prop.address),
      city: text(prop.city),
      country: text(prop.country) ? canonicalCountry(text(prop.country)) : null,
      coverImage: text(prop.coverImage),
      description: text(prop.description),
    };
    const update = Object.fromEntries(Object.entries(known).filter(([, v]) => v !== null));

    const existing =
      (await this.prisma.villa.findFirst({ where: { logifyId: lodgifyId } })) ??
      (opts.matchByName ? await this.prisma.villa.findFirst({ where: { name, logifyId: null } }) : null);
    if (existing) {
      await this.prisma.villa.update({ where: { id: existing.id }, data: { ...update, name, logifyId: lodgifyId } });
      // A villa still in euros in a dirham country moves to its country's currency, its
      // extras converted at today's rate (the amount in euros is kept on each extra).
      const expected = currencyForCountry((known.country as string) ?? existing.country);
      if (existing.currency === 'EUR' && expected !== 'EUR') {
        try {
          await convertVillaCurrency(this.prisma, this.fx, existing.id, expected);
        } catch (e: any) {
          this.logger.warn(`Villa ${name} : conversion en ${expected} reportée (${e?.message})`);
        }
      }
      return { villaId: existing.id, created: false };
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `villa-${lodgifyId}`;
    const existSlug = await this.prisma.villa.findUnique({ where: { slug } });
    const villa = await this.prisma.villa.create({
      data: {
        ...update,
        logifyId: lodgifyId,
        name,
        address: (known.address as string) ?? '',
        city: (known.city as string) ?? '',
        country: (known.country as string) ?? 'France',
        // Extras of a new villa are priced in its country's currency (MAD in Morocco).
        currency: currencyForCountry((known.country as string) ?? 'France'),
        // 0 = not given by Lodgify: shown as "non renseigné", never as a real figure.
        maxGuests: (known.maxGuests as number) ?? 0,
        bedrooms: (known.bedrooms as number) ?? 0,
        bathrooms: (known.bathrooms as number) ?? 0,
        slug: existSlug ? `${slug}-${lodgifyId}` : slug,
        isActive: true,
      },
    });
    return { villaId: villa.id, created: true };
  }

  async saveAllProperties(props: any[]): Promise<{ synced: number; created: number; updated: number; errors: string[] }> {
    let created = 0;
    let updated = 0;
    const errors: string[] = [];
    for (const prop of props) {
      try {
        const result = await this.saveProperty(prop);
        if (result.created) created++;
        else updated++;
      } catch (e: any) {
        errors.push(`${prop.id ?? prop.name}: ${e?.message}`);
      }
    }
    return { synced: created + updated, created, updated, errors };
  }

  async syncProperties(): Promise<{ synced: number; errors: string[]; incomplete: number }> {
    let properties: any[];
    try {
      properties = await this.listProperties({ budgetMs: 12_000 });
    } catch (e: any) {
      throw new Error(`Lodgify properties sync failed: ${e?.message}`);
    }
    let synced = 0;
    const errors: string[] = [];
    for (const prop of properties) {
      try {
        await this.saveProperty(prop, { matchByName: true });
        synced++;
      } catch (e: any) {
        errors.push(`Property ${prop.id}: ${e?.message}`);
      }
    }
    const incomplete = properties.filter((p) => p.bedrooms === null || p.maxGuests === null).length;
    return { synced, errors, incomplete };
  }

  async syncReservations(): Promise<{ synced: number; skipped: number; errors: string[]; unknownProperties: string[] }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');
    let bookings: NonNullable<ReturnType<LodgifyService['mapBooking']>>[];
    try {
      bookings = (await this.fetchBookings(apiKey)).map((r) => this.mapBooking(r)).filter(Boolean) as any;
    } catch (e: any) {
      throw new Error(`Lodgify reservations sync failed: ${e?.message}`);
    }
    this.bookingCache = null;
    return this.copyBookings(bookings);
  }

  /**
   * "A booking is missing": the Lodgify bookings of a guest (name or Lodgify number), with
   * where each one is in the app or why it is not shown. Read from Lodgify, nothing written there.
   */
  async findBookings(q: string, force = false) {
    const norm = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const needle = norm(q);
    if (needle.length < 2) return { query: q, results: [] };
    const bookings = await this.cachedBookings(force);
    const hits = bookings.filter((b) => b.id === q.trim() || norm(b.guestName).includes(needle)).slice(0, 30);
    const [villas, copies, names] = await Promise.all([
      this.prisma.villa.findMany({ where: { logifyId: { in: hits.map((b) => b.propertyId) } }, select: { id: true, name: true, logifyId: true, isActive: true, parentVillaId: true } }),
      this.prisma.reservation.findMany({ where: { logifyId: { in: hits.map((b) => b.id) } }, select: { id: true, logifyId: true, status: true } }),
      this.listingNames(),
    ]);
    const villaOf = new Map(villas.map((v) => [v.logifyId!, v]));
    const copyOf = new Map(copies.map((r) => [r.logifyId!, r]));
    const results = hits
      .map((b) => {
        const villa = villaOf.get(b.propertyId) ?? null;
        const copy = copyOf.get(b.id) ?? null;
        const reason = !villa
          ? 'listing'
          : b.enquiry
            ? 'enquiry'
            : b.status === 'CANCELLED'
              ? 'cancelled'
              : villa && !villa.isActive && !villa.parentVillaId
                ? 'inactive'
                : null;
        return {
          id: b.id,
          guest: b.guestName,
          channel: b.channel,
          checkIn: b.checkIn?.toISOString() ?? null,
          checkOut: b.checkOut?.toISOString() ?? null,
          lodgifyStatus: b.lodgifyStatus,
          listing: { id: b.propertyId, name: b.propertyName ?? names[b.propertyId] ?? `Annonce ${b.propertyId}` },
          villa: villa ? { id: villa.id, name: villa.name } : null,
          /** Copied into the app (extras can be attached to it). */
          inApp: !!copy,
          /** Why it is not on the calendar: listing not in the app, enquiry, cancelled, villa switched off. */
          reason,
        };
      })
      .sort((a, b) => (b.checkIn ?? '').localeCompare(a.checkIn ?? ''));
    return { query: q, readAt: this.bookingCache?.at ? new Date(this.bookingCache.at).toISOString() : null, total: bookings.length, results };
  }

  /** Copies bookings into the app (local copy only, Lodgify is never written to). */
  private async copyBookings(bookings: NonNullable<ReturnType<LodgifyService['mapBooking']>>[]) {
    // Local copy only: villas and clients looked up once, bookings upserted by their Lodgify id.
    const villas = await this.prisma.villa.findMany({ where: { logifyId: { not: null } }, select: { id: true, logifyId: true } });
    const villaByListing = new Map(villas.map((v) => [v.logifyId!, v.id]));
    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];
    const unknown = new Set<string>();

    // Enquiries are not stays: never copied, and copies made earlier are removed when nothing hangs on them.
    const enquiryIds = bookings.filter((b) => b.enquiry).map((b) => b.id);
    if (enquiryIds.length) {
      await this.prisma.reservation.deleteMany({
        where: { logifyId: { in: enquiryIds }, orders: { none: {} }, settlements: { none: {} }, conversations: { none: {} }, calendarEvents: { none: {} } },
      });
    }
    bookings = bookings.filter((b) => !b.enquiry);

    for (const b of bookings) {
      try {
        const villaId = villaByListing.get(b.propertyId);
        if (!villaId) {
          skipped++;
          unknown.add(b.propertyName ? `${b.propertyName} (${b.propertyId})` : b.propertyId);
          continue;
        }
        if (!b.checkIn || !b.checkOut) {
          errors.push(`Réservation ${b.id} : dates absentes dans Lodgify`);
          continue;
        }
        const placeholder = !b.guestEmail;
        const guestEmail = b.guestEmail || `lodgify-guest-${b.id}@malodge.local`;
        let client = await this.prisma.user.findUnique({ where: { email: guestEmail } });
        if (!client) {
          const [firstName = 'Client', ...lastParts] = b.guestName.split(/\s+/);
          client = await this.prisma.user.create({
            data: {
              email: guestEmail,
              password: '$2b$12$placeholder',
              firstName,
              lastName: lastParts.join(' ') || 'Lodgify',
              role: 'CLIENT',
              isActive: true,
              // A guest without e-mail is a record, not an account.
              canLogin: !placeholder,
              phone: b.guestPhone || null,
            },
          });
        }
        const data = {
          villaId,
          clientId: client.id,
          checkIn: b.checkIn,
          checkOut: b.checkOut,
          guests: b.guests,
          totalAmount: b.totalAmount,
          currency: b.currency,
          status: b.status as any,
          source: 'lodgify',
          notes: b.notes,
        };
        await this.prisma.reservation.upsert({ where: { logifyId: b.id }, update: data, create: { ...data, logifyId: b.id } });
        synced++;
      } catch (e: any) {
        errors.push(`Réservation ${b.id} : ${e?.message}`);
      }
    }
    if (unknown.size) this.logger.warn(`Lodgify: réservations ignorées, logements non synchronisés : ${[...unknown].join(', ')}`);
    return { synced, skipped, errors, unknownProperties: [...unknown] };
  }
}
