import { useQuery } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { formatCurrency } from './utils';

export interface FxQuote {
  base: 'EUR';
  /** 1 EUR = rates[X] X. */
  rates: Record<string, number | undefined>;
  date: string;
  source: string;
  stale: boolean;
}

/** Today's exchange rates (server-side, from public sources, refreshed every 12 h). */
export function useFx() {
  return useQuery({
    queryKey: ['fx'],
    queryFn: async () => {
      const res = await apiClient.get('/fx');
      return (res.data?.data ?? res.data) as FxQuote | null;
    },
    staleTime: 60 * 60_000,
    retry: false,
  });
}

/** Amounts are converted on screen to the display currency (top bar), so equivalents are not shown. */
const DISPLAY_CONVERTS = true;

/** How many `to` for one `from`, or null when unknown. */
export function fxRate(q: FxQuote | null | undefined, from: string, to: string): number | null {
  if (!from || !to) return null;
  if (from === to) return 1;
  const a = q?.rates[from];
  const b = q?.rates[to];
  return a && b ? b / a : null;
}

export function convert(q: FxQuote | null | undefined, amount: number, from: string, to: string): number | null {
  const r = fxRate(q, from, to);
  return r == null ? null : amount * r;
}

/**
 * "≈ 10 961 MAD" next to an amount in another currency (euros…). The amount
 * itself is never changed: this is today's equivalent, for reading only.
 */
export function MadEquivalent({ amount, currency, className }: { amount: number | null | undefined; currency: string | null | undefined; className?: string }) {
  const { data: q } = useFx();
  // Every amount is now shown in the display currency chosen in the top bar: no second figure.
  if (DISPLAY_CONVERTS) return null;
  if (amount == null || !currency || currency === 'MAD') return null;
  const mad = convert(q, amount, currency, 'MAD');
  if (mad == null) return null;
  return (
    <span className={className ?? 'text-[11.5px] text-muted font-normal'} title={q ? `Taux du ${q.date} : 1 € = ${fxRate(q, 'EUR', 'MAD')?.toFixed(4)} MAD (${q.source})` : undefined}>
      ≈ {formatCurrency(Math.round(mad), 'MAD')}
    </span>
  );
}

/** "1 € = 10,96 MAD · taux du 26/11/2026" */
export function FxNote({ className }: { className?: string }) {
  const { data: q } = useFx();
  const r = fxRate(q, 'EUR', 'MAD');
  if (!q || r == null) return null;
  const day = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC' }).format(new Date(`${q.date}T00:00:00Z`));
  return (
    <span className={className ?? 'text-[12px] text-muted'}>
      1 € = {r.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} MAD · taux du {day}
      {q.stale ? ' (dernier taux connu)' : ''}
    </span>
  );
}
