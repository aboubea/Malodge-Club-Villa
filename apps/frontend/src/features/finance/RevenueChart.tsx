import { useState } from 'react';
import { cn, formatCurrency } from '../../lib/utils';
import { toDisplay } from '../../lib/display';

export interface SeriesPoint {
  key: string;
  label: string;
  accommodation: number;
  extras: number;
  /** After today: nights still to come. */
  upcoming: boolean;
}

/** Long name of a bar: "mar. 12 nov." for a day (YYYY-MM-DD), "mars 2026" for a month (YYYY-MM). */
export function pointName(key: string) {
  if (/^\d{4}-\d{2}$/.test(key)) return new Date(`${key}-01T00:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Round axis steps (1, 2, 2.5 or 5 × 10ⁿ), about four of them up to `max`. */
function axis(max: number): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * p >= raw) ?? 10) * p;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

/** "12 k MAD" for the axis, in the display currency. */
function compact(amount: number, currency: string) {
  const d = toDisplay(amount, currency);
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: d.currency, notation: 'compact', maximumFractionDigits: 1 }).format(d.amount);
}

/** Share of the plot height used by the axis top (room left above for reading). */
const TOP = 0.92;

export const SERIES = [
  { key: 'accommodation' as const, label: 'Hébergement', fill: 'bg-chart-1' },
  { key: 'extras' as const, label: 'Extras', fill: 'bg-chart-2' },
];

/**
 * Revenue per day (or per month), accommodation and extras stacked: one axis, thin bars
 * anchored on the baseline, a 2 px gap between the two parts, a tooltip on hover or tap.
 */
export function RevenueChart({ data, currency, perMonth }: { data: SeriesPoint[]; currency: string; perMonth?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const ticks = axis(Math.max(0, ...data.map((p) => p.accommodation + p.extras)));
  const max = ticks[ticks.length - 1];
  const anyUpcoming = data.some((p) => p.upcoming && p.accommodation > 0);
  const empty = data.every((p) => !p.accommodation && !p.extras);
  // Fewer day numbers on narrow screens: every 5th one, the others from `sm` up.
  const labelEvery = data.length > 14 ? 5 : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-soft mb-3">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn('w-2.5 h-2.5 rounded-[3px]', s.fill)} />
            {s.label}
          </span>
        ))}
        {anyUpcoming && (
          <span className="inline-flex items-center gap-1.5 text-muted">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-chart-1/40" />
            Nuits à venir (réservées)
          </span>
        )}
        <button type="button" onClick={() => setAsTable((v) => !v)} className="ml-auto text-[12px] font-semibold text-accent hover:underline">
          {asTable ? 'Voir le graphique' : 'Voir le tableau'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-80 overflow-auto rounded-xl border border-line">
          <table className="w-full text-[12.5px] tabular">
            <thead className="sticky top-0 bg-surface-2 text-muted">
              <tr>
                <th className="text-left font-semibold px-3 py-2">{perMonth ? 'Mois' : 'Jour'}</th>
                <th className="text-right font-semibold px-3 py-2">Hébergement</th>
                <th className="text-right font-semibold px-3 py-2">Extras</th>
                <th className="text-right font-semibold px-3 py-2">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((p) => (
                <tr key={p.key} className={cn(p.upcoming && 'text-muted')}>
                  <td className="px-3 py-1.5 first-letter:uppercase">{pointName(p.key)}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(p.accommodation, currency)}</td>
                  <td className="px-3 py-1.5 text-right">{formatCurrency(p.extras, currency)}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-ink">{formatCurrency(p.accommodation + p.extras, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : empty ? (
        <div className="h-56 flex items-center justify-center text-[13px] text-muted">Aucun chiffre d’affaires sur cette période</div>
      ) : (
        <div className="relative flex h-60 select-none" onMouseLeave={() => setHover(null)}>
          {/* Axis: amounts on the left, recessive grid lines */}
          <div className="relative w-14 shrink-0">
            {ticks.map((v) => (
              <span key={v} className="absolute right-2 translate-y-1/2 text-[10.5px] text-muted tabular" style={{ bottom: `calc(22px + (100% - 22px) * ${(v / max) * TOP})` }}>
                {v === 0 ? '0' : compact(v, currency)}
              </span>
            ))}
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-x-0 top-0 bottom-[22px]">
              {ticks.map((v) => (
                <div key={v} className={cn('absolute inset-x-0 border-t', v === 0 ? 'border-line-strong' : 'border-line/70 border-dashed')} style={{ bottom: `${(v / max) * TOP * 100}%` }} />
              ))}
            </div>
            <div className="absolute inset-0 flex">
              {data.map((p, i) => {
                const total = p.accommodation + p.extras;
                const h = (total / max) * TOP * 100;
                const accH = total ? (p.accommodation / total) * 100 : 0;
                return (
                  <button
                    key={p.key}
                    type="button"
                    aria-label={`${pointName(p.key)} : ${formatCurrency(total, currency)}`}
                    onMouseEnter={() => setHover(i)}
                    onFocus={() => setHover(i)}
                    onClick={() => setHover(i)}
                    className="relative flex-1 min-w-0 h-full flex flex-col justify-end items-center focus:outline-none"
                  >
                    <div className={cn('absolute inset-x-0 top-0 bottom-[22px] rounded-md transition-colors flex flex-col justify-end items-center', hover === i && 'bg-ink/[0.04]')}>
                    <div className="w-[62%] max-w-[30px] flex flex-col justify-end" style={{ height: `${h}%` }}>
                      {p.extras > 0 && (
                        <div
                          className={cn('bg-chart-2 rounded-t-[4px]', p.accommodation > 0 && 'border-b-2 border-surface')}
                          style={{ height: `${100 - accH}%`, minHeight: 3 }}
                        />
                      )}
                      {p.accommodation > 0 && (
                        <div className={cn(p.upcoming ? 'bg-chart-1/40' : 'bg-chart-1', !p.extras && 'rounded-t-[4px]')} style={{ height: `${accH}%`, minHeight: 3 }} />
                      )}
                    </div>
                    </div>
                    <span
                      className={cn(
                        'absolute bottom-0 h-[22px] flex items-end text-[10.5px] tabular whitespace-nowrap',
                        hover === i ? 'text-ink font-semibold' : 'text-muted',
                        labelEvery > 1 && i % labelEvery !== 0 && 'hidden md:flex',
                      )}
                    >
                      {p.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {hover != null && data[hover] && (
              <div
                className="pointer-events-none absolute top-0 z-10 w-60 rounded-xl border border-line bg-surface shadow-pop p-3 text-[12.5px]"
                style={{ left: `clamp(0px, calc(${((hover + 0.5) / data.length) * 100}% - 120px), calc(100% - 240px))` }}
              >
                <p className="font-semibold text-ink first-letter:uppercase">{pointName(data[hover].key)}</p>
                {SERIES.map((s) => (
                  <p key={s.key} className="mt-1.5 flex items-center gap-2 text-ink-soft">
                    <span className={cn('w-2 h-2 rounded-[2px] shrink-0', s.fill, s.key === 'accommodation' && data[hover].upcoming && 'bg-chart-1/40')} />
                    {s.label}
                    <span className="ml-auto tabular text-ink">{formatCurrency(data[hover][s.key], currency)}</span>
                  </p>
                ))}
                <p className="mt-2 pt-2 border-t border-line flex font-semibold text-ink">
                  Total <span className="ml-auto tabular">{formatCurrency(data[hover].accommodation + data[hover].extras, currency)}</span>
                </p>
                {data[hover].upcoming && data[hover].accommodation > 0 && <p className="mt-1 text-[11.5px] text-muted">Nuits réservées, pas encore passées</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
