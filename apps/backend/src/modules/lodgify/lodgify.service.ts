import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as https from 'https';

@Injectable()
export class LodgifyService {
  private readonly logger = new Logger(LodgifyService.name);

  constructor(private prisma: PrismaService) {}

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

  private async lodgifyGet(path: string, extraHeaders: Record<string, string>): Promise<any> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.lodgify.com',
        path,
        method: 'GET',
        headers: { 'Accept': 'application/json', ...extraHeaders },
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          if (status === 401 || status === 403) {
            return reject(new Error(`Clé API Lodgify invalide ou non autorisée (HTTP ${status})`));
          }
          if (status >= 400) {
            const preview = data.slice(0, 200).replace(/\s+/g, ' ');
            return reject(new Error(`Lodgify HTTP ${status}: ${preview}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            const preview = data.slice(0, 200).replace(/\s+/g, ' ');
            reject(new Error(`Réponse Lodgify non-JSON (HTTP ${status}): ${preview}`));
          }
        });
      });
      req.on('error', (err) => reject(new Error(`Erreur réseau Lodgify: ${err.message}`)));
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

  private async lodgifyGetAny(path: string, apiKey: string): Promise<any> {
    const errors: string[] = [];
    for (const headers of this.authHeaders(apiKey)) {
      try {
        return await this.lodgifyGet(path, headers);
      } catch (e: any) {
        errors.push(`[${JSON.stringify(Object.keys(headers))}] ${e?.message}`);
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

  async listReservations(): Promise<any[]> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');

    const from = new Date();
    from.setDate(from.getDate() - 90);
    const to = new Date();
    to.setDate(to.getDate() + 365);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];

    this.logger.log(`Lodgify: clé longueur=${apiKey.length}, début=${apiKey.slice(0, 4)}…`);

    const data = await this.lodgifyProbe([
      // endpoint documenté officiel Lodgify
      `/v2/reservations/bookings?dateFrom=${fromStr}&dateTo=${toStr}`,
      `/v2/reservations/bookings`,
      // variantes avec paramètres alternatifs
      `/v2/reservations/bookings?checkInStart=${fromStr}&checkInEnd=${toStr}`,
      `/v2/reservations/bookings?arrival_date_min=${fromStr}&arrival_date_max=${toStr}`,
      // v1 reservation (pas booking)
      `/v1/reservation/booking`,
      `/v1/reservation?dateFrom=${fromStr}&dateTo=${toStr}`,
      // rental-api (gateway Lodgify)
      `/rental-api/v2/reservations/bookings?dateFrom=${fromStr}&dateTo=${toStr}`,
      `/rental-api/v2/reservations/bookings`,
    ], apiKey);
    const items: any[] = Array.isArray(data) ? data : (data.items ?? data.data ?? []);

    return items.map((r) => ({
      id: String(r.id),
      propertyId: String(r.property_id),
      propertyName: r.property_name ?? r.property?.name ?? null,
      guestName: r.guest?.name ?? r.requester_name ?? 'Inconnu',
      guestEmail: r.guest?.email ?? null,
      guestPhone: r.guest?.phone ?? null,
      checkIn: r.arrival_date ?? r.check_in,
      checkOut: r.departure_date ?? r.check_out,
      guests: r.people_count ?? r.guests_count ?? 1,
      totalAmount: parseFloat(r.total_amount ?? r.price ?? 0),
      status: r.status ?? 'unknown',
      source: 'lodgify',
      notes: r.notes ?? null,
    }));
  }

  async syncProperties(): Promise<{ synced: number; errors: string[] }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');

    let synced = 0;
    const errors: string[] = [];

    try {
      const data = await this.lodgifyGetAny('/v1/property', apiKey);
      const properties: any[] = Array.isArray(data) ? data : (data.items ?? []);

      for (const prop of properties) {
        try {
          const lodgifyId = String(prop.id);
          const existingVilla = await this.prisma.villa.findFirst({
            where: { OR: [{ logifyId: lodgifyId }, { name: prop.name }] },
          });

          const slug = (prop.name || `property-${prop.id}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');

          const data: any = {
            logifyId: lodgifyId,
            name: prop.name || `Property ${prop.id}`,
            address: prop.address?.street || prop.location?.name || '',
            city: prop.location?.city || prop.address?.city || '',
            country: prop.location?.country || 'France',
            maxGuests: prop.people_capacity ?? prop.max_people ?? 1,
            bedrooms: prop.bedrooms_number ?? prop.rooms_count ?? 1,
            bathrooms: prop.bathrooms_number ?? 1,
            coverImage: prop.images?.[0]?.url ?? null,
          };

          if (existingVilla) {
            await this.prisma.villa.update({ where: { id: existingVilla.id }, data });
          } else {
            const existSlug = await this.prisma.villa.findUnique({ where: { slug } });
            await this.prisma.villa.create({
              data: {
                ...data,
                slug: existSlug ? `${slug}-${prop.id}` : slug,
                isActive: true,
              },
            });
          }
          synced++;
        } catch (e: any) {
          errors.push(`Property ${prop.id}: ${e?.message}`);
        }
      }
    } catch (e: any) {
      throw new Error(`Lodgify properties sync failed: ${e?.message}`);
    }

    return { synced, errors };
  }

  async syncReservations(): Promise<{ synced: number; skipped: number; errors: string[] }> {
    const apiKey = await this.getApiKey();
    if (!apiKey) throw new Error('Lodgify API key not configured');

    let synced = 0;
    let skipped = 0;
    const errors: string[] = [];

    try {
      const from = new Date();
      from.setDate(from.getDate() - 90);
      const to = new Date();
      to.setDate(to.getDate() + 365);

      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];

      const data = await this.lodgifyProbe([
        `/v2/reservations?dateFrom=${fromStr}&dateTo=${toStr}&includeRecords=true`,
        `/v1/booking?checkInStart=${fromStr}&checkInEnd=${toStr}&includeGuest=true&resultsPerPage=200`,
        `/rental-api/v1/reservations?dateFrom=${fromStr}&dateTo=${toStr}`,
        `/rental-api/v1/booking?checkInStart=${fromStr}&checkInEnd=${toStr}`,
      ], apiKey);
      const reservations: any[] = Array.isArray(data) ? data : (data.items ?? []);

      for (const res of reservations) {
        try {
          const lodgifyId = String(res.id);

          const villa = await this.prisma.villa.findFirst({
            where: { logifyId: String(res.property_id) },
          });
          if (!villa) {
            skipped++;
            continue;
          }

          const guestEmail = res.guest?.email || `lodgify-guest-${res.id}@malodge.local`;
          let client = await this.prisma.user.findUnique({ where: { email: guestEmail } });
          if (!client) {
            const [firstName = 'Guest', ...lastParts] = (res.guest?.name || 'Guest Lodgify').split(' ');
            const hashedPw = '$2b$12$placeholder';
            client = await this.prisma.user.create({
              data: {
                email: guestEmail,
                password: hashedPw,
                firstName,
                lastName: lastParts.join(' ') || 'Lodgify',
                role: 'CLIENT',
                isActive: true,
                phone: res.guest?.phone || null,
              },
            });
          }

          const statusMap: Record<string, string> = {
            booked: 'CONFIRMED',
            confirmed: 'CONFIRMED',
            check_in: 'ACTIVE',
            check_out: 'COMPLETED',
            cancelled: 'CANCELLED',
            pending: 'PENDING',
          };

          const resData = {
            villaId: villa.id,
            clientId: client.id,
            checkIn: new Date(res.arrival_date || res.check_in),
            checkOut: new Date(res.departure_date || res.check_out),
            guests: res.people_count ?? res.guests_count ?? 1,
            totalAmount: parseFloat(res.total_amount ?? res.price ?? 0),
            status: (statusMap[res.status?.toLowerCase()] || 'PENDING') as any,
            source: 'lodgify',
          };

          const existing = await this.prisma.reservation.findUnique({ where: { logifyId: lodgifyId } });
          if (existing) {
            await this.prisma.reservation.update({ where: { id: existing.id }, data: resData });
          } else {
            await this.prisma.reservation.create({ data: { ...resData, logifyId: lodgifyId } });
          }
          synced++;
        } catch (e: any) {
          errors.push(`Reservation ${res.id}: ${e?.message}`);
        }
      }
    } catch (e: any) {
      throw new Error(`Lodgify reservations sync failed: ${e?.message}`);
    }

    return { synced, skipped, errors };
  }
}
