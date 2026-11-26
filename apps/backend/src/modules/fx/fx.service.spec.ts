import { afterEach, describe, expect, it, vi } from 'vitest';
import { FxQuote, FxService } from './fx.service';

/** In-memory AppSetting table. */
function fakePrisma(initial: Record<string, unknown> = {}) {
  const rows = new Map(Object.entries(initial));
  return {
    rows,
    appSetting: {
      findUnique: async ({ where }: any) => (rows.has(where.key) ? { key: where.key, value: rows.get(where.key) } : null),
      upsert: async ({ where, create }: any) => {
        rows.set(where.key, create.value);
        return create;
      },
    },
  };
}

const quote = (over: Partial<FxQuote> = {}): FxQuote => ({
  base: 'EUR',
  rates: { EUR: 1, MAD: 10.96, USD: 1.08 },
  date: '2026-11-26',
  source: 'test',
  fetchedAt: new Date().toISOString(),
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('exchange rates', () => {
  const fx = new FxService(fakePrisma() as any);

  it('converts between any two currencies through the euro', () => {
    const q = quote();
    expect(fx.rateOf(q, 'EUR', 'MAD')).toBeCloseTo(10.96);
    expect(fx.rateOf(q, 'MAD', 'EUR')).toBeCloseTo(1 / 10.96);
    expect(fx.rateOf(q, 'usd', 'mad')).toBeCloseTo(10.96 / 1.08);
  });

  it('never guesses a rate it does not have', () => {
    expect(fx.rateOf(quote(), 'EUR', 'XYZ')).toBeNull();
    expect(fx.rateOf(null, 'EUR', 'MAD')).toBeNull();
    // Same currency needs no rate.
    expect(fx.rateOf(null, 'MAD', 'MAD')).toBe(1);
  });

  it('uses the rate stored today without calling the sources', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const service = new FxService(fakePrisma({ 'fx.latest': quote() }) as any);
    expect((await service.quote())?.rates.MAD).toBe(10.96);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps the last known rate, flagged as old, when the sources are down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const old = quote({ fetchedAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });
    const service = new FxService(fakePrisma({ 'fx.latest': old }) as any);
    const q = await service.quote();
    expect(q?.rates.MAD).toBe(10.96);
    expect(q?.stale).toBe(true);
  });

  it('refreshes an old rate from the first source and stores it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'success', rates: { MAD: 11.02 }, time_last_update_unix: 1_795_000_000 }) }),
    );
    const prisma = fakePrisma({ 'fx.latest': quote({ fetchedAt: '2026-01-01T00:00:00Z' }) });
    const q = await new FxService(prisma as any).quote();
    expect(q?.rates.MAD).toBe(11.02);
    expect((prisma.rows.get('fx.latest') as FxQuote).rates.MAD).toBe(11.02);
  });
});
