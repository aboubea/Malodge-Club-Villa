import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface FxQuote {
  /** 1 EUR = rates[X] X. */
  base: 'EUR';
  rates: Record<string, number>;
  /** Day the rate applies to (YYYY-MM-DD). */
  date: string;
  source: string;
  fetchedAt: string;
  /** True when the last refresh failed and an older rate is used. */
  stale?: boolean;
}

const KEY = 'fx.latest';
const MAX_AGE = 12 * 3600_000;

/**
 * Exchange rates of the day (EUR base), read from public sources and kept in
 * the database: amounts are never rewritten with them, only shown or totalled
 * converted (e.g. 1 000 € ≈ 10 961 MAD).
 */
@Injectable()
export class FxService {
  private readonly logger = new Logger(FxService.name);
  private memo: FxQuote | null = null;
  private inflight: Promise<FxQuote | null> | null = null;

  constructor(private prisma: PrismaService) {}

  private async fetchJson(url: string): Promise<any> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async download(): Promise<FxQuote> {
    const now = new Date().toISOString();
    try {
      const d = await this.fetchJson('https://open.er-api.com/v6/latest/EUR');
      if (d?.result === 'success' && d.rates?.MAD > 0) {
        const date = d.time_last_update_unix ? new Date(d.time_last_update_unix * 1000).toISOString().slice(0, 10) : now.slice(0, 10);
        return { base: 'EUR', rates: { EUR: 1, ...d.rates }, date, source: 'open.er-api.com', fetchedAt: now };
      }
      throw new Error('réponse inattendue');
    } catch (e: any) {
      this.logger.warn(`Taux open.er-api.com indisponible (${e?.message}), essai de la source de secours`);
    }
    const d = await this.fetchJson('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json');
    const rates = Object.fromEntries(Object.entries(d?.eur ?? {}).map(([k, v]) => [k.toUpperCase(), Number(v)]).filter(([, v]) => (v as number) > 0));
    if (!(rates.MAD > 0)) throw new Error('taux MAD absent');
    return { base: 'EUR', rates: { ...rates, EUR: 1 }, date: d.date ?? now.slice(0, 10), source: 'fawazahmed0/currency-api', fetchedAt: now };
  }

  /** Today's rates: from memory, the database, or the sources (at most every 12 h). */
  async quote(): Promise<FxQuote | null> {
    const fresh = (q: FxQuote | null) => !!q && Date.now() - new Date(q.fetchedAt).getTime() < MAX_AGE;
    if (fresh(this.memo)) return this.memo;
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const stored = (await this.prisma.appSetting.findUnique({ where: { key: KEY } }))?.value as unknown as FxQuote | undefined;
      if (stored && fresh(stored)) return (this.memo = stored);
      try {
        const q = await this.download();
        await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value: q as any }, create: { key: KEY, value: q as any } });
        return (this.memo = q);
      } catch (e: any) {
        this.logger.warn(`Taux de change indisponibles : ${e?.message}`);
        // The last known rate is better than none; it is flagged as such.
        return (this.memo = stored ? { ...stored, stale: true } : null);
      }
    })().finally(() => (this.inflight = null));
    return this.inflight;
  }

  /** How many `to` for one `from` (null when unknown). */
  rateOf(q: FxQuote | null, from: string, to: string): number | null {
    const a = from?.toUpperCase();
    const b = to?.toUpperCase();
    if (!a || !b) return null;
    if (a === b) return 1;
    if (!q) return null;
    const ra = q.rates[a];
    const rb = q.rates[b];
    return ra > 0 && rb > 0 ? rb / ra : null;
  }

  async rate(from: string, to: string) {
    return this.rateOf(await this.quote(), from, to);
  }
}
