import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LodgifyService, bookingGuests } from './lodgify.service';
import { extractCapacity } from './lodgify-capacity';

/**
 * Lodgify is read-only for the app: it reads (GET) and never creates, changes or
 * deletes anything there. These tests fail if a write to Lodgify ever appears.
 */

/** Every HTTP request the service makes goes through this mock (nothing leaves the machine). */
const request = vi.hoisted(() => vi.fn());
vi.mock('https', async (importOriginal) => {
  const actual = await importOriginal<typeof import('https')>();
  return { ...actual, default: { ...actual, request }, request };
});

const SRC = path.join(__dirname, '..', '..');
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.ts$/.test(e.name) && !/\.spec\.ts$/.test(e.name) ? [p] : [];
  });

describe('Lodgify is read-only', () => {
  it('only one file talks to Lodgify, through a single HTTP call that is a GET', () => {
    const files = sources(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes('lodgify.com'));
    expect(files.map((f) => path.relative(SRC, f))).toEqual([path.join('modules', 'lodgify', 'lodgify.service.ts')]);

    const code = fs.readFileSync(files[0], 'utf8');
    expect(code.match(/https\.request\(/g)).toHaveLength(1);
    expect(code).toMatch(/hostname: 'api\.lodgify\.com',\s*path,\s*method: 'GET'/);
    expect(code).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
    expect(code).not.toMatch(/\bfetch\(|axios|\.write\(/);
  });

  afterEach(() => request.mockReset());

  it('reads bookings and listings with GET requests only', async () => {
    const calls: { method?: string; path?: string }[] = [];
    request.mockImplementation((options: any, cb: (res: any) => void) => {
      calls.push({ method: options.method, path: options.path });
      const res: any = new EventEmitter();
      res.statusCode = 200;
      const req: any = new EventEmitter();
      req.setTimeout = () => req;
      req.destroy = () => undefined;
      req.end = () => {
        cb(res);
        res.emit('data', JSON.stringify({ items: [], count: 0 }));
        res.emit('end');
      };
      return req;
    });

    const service = new LodgifyService({} as any, {} as any) as any;
    await service.fetchBookings('test-key');
    await service.fetchPropertyList('test-key');

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});

describe('Lodgify booking in the app', () => {
  const service = new LodgifyService({} as any, {} as any) as any;
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  it('keeps the stay dates as calendar days and the Lodgify currency', () => {
    const b = service.mapBooking({ id: 12, status: 'Booked', arrival: '2030-08-10', departure: '2030-08-17', total_amount: '1234.5', currency_code: 'eur', property_id: 99, guest: { name: ' Ana ' } });
    expect(b).toMatchObject({ id: '12', propertyId: '99', guestName: 'Ana', totalAmount: 1234.5, currency: 'EUR', status: 'CONFIRMED', enquiry: false });
    expect(b.checkIn.toISOString()).toBe('2030-08-10T00:00:00.000Z');
    expect(b.checkOut.toISOString()).toBe('2030-08-17T00:00:00.000Z');
  });

  it('marks stays under way and over from their dates', () => {
    expect(service.mapBooking({ id: 1, status: 'Booked', arrival: day(-2), departure: day(3) }).status).toBe('ACTIVE');
    expect(service.mapBooking({ id: 2, status: 'Booked', arrival: day(-9), departure: day(-2) }).status).toBe('COMPLETED');
  });

  it('flags enquiries and cancellations, and ignores calendar blocks', () => {
    expect(service.mapBooking({ id: 3, status: 'Open', arrival: day(5), departure: day(8) })).toMatchObject({ enquiry: true, status: 'PENDING' });
    expect(service.mapBooking({ id: 4, status: 'Declined', arrival: day(5), departure: day(8) }).status).toBe('CANCELLED');
    expect(service.mapBooking({ id: 5, status: 'Unavailable', arrival: day(5), departure: day(8) })).toBeNull();
  });

  it('names the booking channel', () => {
    const channel = (source: string) => service.mapBooking({ id: 6, status: 'Booked', source }).channel;
    expect(channel('AirbnbIntegration')).toBe('Airbnb');
    expect(channel('BookingCom')).toBe('Booking.com');
    expect(channel('Manual')).toBe('Direct');
  });

  it('counts guests whatever the API version', () => {
    expect(bookingGuests({ people_count: 4 })).toBe(4);
    expect(bookingGuests({ rooms: [{ guest_breakdown: { adults: 2, children: 1 } }, { people: 2 }] })).toBe(5);
    expect(bookingGuests({})).toBeNull();
  });

  it('reads bedrooms and guests of a listing, from its fields first, then its rooms, then its text', () => {
    const fromFields = extractCapacity({ properties: [{ bedrooms: 4, max_people: 8 }], rooms: [], texts: [] });
    expect(fromFields).toMatchObject({ bedrooms: 4, maxGuests: 8, source: { bedrooms: 'lodgify', maxGuests: 'lodgify' } });

    const fromText = extractCapacity({ properties: [{}], rooms: [], texts: ['Superbe villa de 5 chambres pour 10 personnes'] });
    expect(fromText).toMatchObject({ bedrooms: 5, maxGuests: 10, source: { bedrooms: 'description', maxGuests: 'description' } });

    // Never a made-up default when nothing is found.
    expect(extractCapacity({ properties: [{}], rooms: [], texts: [] })).toMatchObject({ bedrooms: null, maxGuests: null });
  });
});
