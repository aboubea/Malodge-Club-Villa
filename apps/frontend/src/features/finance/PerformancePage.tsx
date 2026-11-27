import { useMemo, useState } from 'react';
import { segItem, segOff, segOn, segTrack } from '../../components/ui/segmented';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatMoney } from '../../lib/utils';
import { PageHeader } from '../../components/layout/PageHeader';
import { Skeleton } from '../../components/ui/Skeleton';
import { activityKind } from '../calendar/agendaIcons';
import { ColSpec, ColumnHeader, TableFilterSummary, useTableControls } from '../../components/ui/tableControls';

type Kind = 'month' | 'quarter' | 'year';
interface Metrics {
  nightsAvailable: number;
  nightsSold: number;
  occupancy: number | null;
  accommodationRevenue: number;
  adr: number | null;
  revpar: number | null;
  stays: number;
  extrasRevenue: number;
  extrasCost: number;
  extrasMargin: number;
  extrasCount: number;
  extrasPerStay: number | null;
  costEstimated: boolean;
}
interface Group {
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  costKnown: boolean;
}
interface Report {
  kind: Kind;
  period: { start: string; end: string; complete: boolean };
  previousPeriod: { start: string; end: string };
  currency: string;
  fx: { eurToMad: number | null; date: string; stale: boolean } | null;
  unconverted: string[];
  totals: { current: Metrics; previous: Metrics };
  houses: { id: string; name: string; city: string; lodgify: boolean; formulas: number; current: Metrics; previous: Metrics }[];
  activities: { key: string; name: string; category: string | null; current: Group; previous: Group }[];
  providers: { id: string; name: string; current: Group; previous: Group }[];
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const mad = (n: number | null | undefined) => (n == null ? '—' : formatMoney(Math.round(n), 'MAD'));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function label(kind: Kind, start: string, end: string, complete: boolean) {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const base = kind === 'year' ? `${s.getUTCFullYear()}` : kind === 'quarter' ? `T${Math.floor(s.getUTCMonth() / 3) + 1} ${s.getUTCFullYear()}` : `${MONTHS[s.getUTCMonth()]} ${s.getUTCFullYear()}`;
  return complete ? base : `${base} (jusqu’au ${e.getUTCDate()} ${MONTHS[e.getUTCMonth()]})`;
}

function shift(date: string, kind: Kind, by: number) {
  const d = new Date(`${date}T00:00:00Z`);
  if (kind === 'year') d.setUTCFullYear(d.getUTCFullYear() + by);
  else d.setUTCMonth(d.getUTCMonth() + (kind === 'quarter' ? 3 : 1) * by, 1);
  return iso(d);
}

/** Change vs last year: points for a rate, % for an amount. */
function Delta({ cur, prev, rate }: { cur: number | null; prev: number | null; rate?: boolean }) {
  if (cur == null || prev == null) return <span className="text-[11.5px] text-muted">—</span>;
  if (cur === prev) return <span className="text-[11.5px] text-muted">=</span>;
  let value: number;
  let text: string;
  if (rate) {
    value = (cur - prev) * 100;
    text = `${value >= 0 ? '+' : ''}${value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} pt${Math.abs(value) >= 2 ? 's' : ''}`;
  } else if (prev === 0) {
    if (cur === 0) return <span className="text-[11.5px] text-muted">=</span>;
    return <span className="text-[11.5px] font-semibold text-success">nouveau</span>;
  } else {
    value = ((cur - prev) / Math.abs(prev)) * 100;
    text = `${value >= 0 ? '+' : ''}${Math.round(value)} %`;
  }
  const up = value >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11.5px] font-semibold tabular', Math.abs(value) < 0.5 ? 'text-muted' : up ? 'text-success' : 'text-danger')}>
      {Math.abs(value) >= 0.5 && (up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />)}
      {text}
    </span>
  );
}

function Kpi({ title, value, cur, prev, rate, hint }: { title: string; value: string; cur: number | null; prev: number | null; rate?: boolean; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4" title={hint}>
      <p className="text-[12px] text-muted">{title}</p>
      <p className="text-[20px] font-bold text-ink tabular leading-tight mt-1">{value}</p>
      <div className="mt-1 flex items-center gap-1.5">
        <Delta cur={cur} prev={prev} rate={rate} />
        <span className="text-[11px] text-muted">vs N-1</span>
      </div>
    </div>
  );
}

function OccupancyBar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="h-1.5 flex-1 rounded-full bg-surface-2 overflow-hidden">
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (value ?? 0) * 100)}%` }} />
      </div>
      <span className="text-[12.5px] font-semibold text-ink tabular w-12 text-right">{pct(value)}</span>
    </div>
  );
}

const th = 'px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-muted whitespace-nowrap';
const td = 'px-3 py-2.5 text-[13px] text-ink tabular whitespace-nowrap';

/** Sort and filter values: amounts in whole dirhams and rates in %, as shown. */
const whole = (n: number | null | undefined) => (n == null ? null : Math.round(n));
const percent = (n: number | null | undefined) => (n == null ? null : Math.round(n * 1000) / 10);
/** Change vs last year in %, as the Delta shows it (none when last year had nothing). */
const change = (cur: number, prev: number) => (prev === 0 ? (cur === 0 ? 0 : null) : Math.round(((cur - prev) / Math.abs(prev)) * 100));

type House = Report['houses'][number];
const HOUSE_COLS: ColSpec<House>[] = [
  { key: 'villa', label: 'Villa', value: (h) => h.name },
  { key: 'occupancy', label: 'Occupation', kind: 'number', value: (h) => percent(h.current.occupancy) },
  { key: 'nights', label: 'Nuits', kind: 'number', align: 'right', value: (h) => h.current.nightsSold },
  { key: 'adr', label: 'Prix moyen', kind: 'number', align: 'right', value: (h) => whole(h.current.adr) },
  { key: 'revpar', label: 'RevPAR', kind: 'number', align: 'right', value: (h) => whole(h.current.revpar) },
  { key: 'accommodation', label: 'CA hébergement', kind: 'number', align: 'right', value: (h) => whole(h.current.accommodationRevenue) },
  { key: 'extras', label: 'Extras', kind: 'number', align: 'right', value: (h) => whole(h.current.extrasRevenue) },
  { key: 'extrasPerStay', label: 'Extras / séjour', kind: 'number', align: 'right', value: (h) => whole(h.current.extrasPerStay) },
  { key: 'margin', label: 'Marge extras', kind: 'number', align: 'right', value: (h) => whole(h.current.extrasMargin) },
];

type GroupRow = { key: string; name: string; sub?: string | null; current: Group; previous: Group };
const GROUP_COLS: ColSpec<GroupRow>[] = [
  { key: 'name', label: 'Nom', value: (r) => r.name },
  { key: 'count', label: 'Nb', kind: 'number', align: 'right', value: (r) => r.current.count },
  { key: 'revenue', label: 'CA', kind: 'number', align: 'right', value: (r) => whole(r.current.revenue) },
  { key: 'margin', label: 'Marge', kind: 'number', align: 'right', value: (r) => whole(r.current.margin) },
  { key: 'change', label: 'vs N-1', kind: 'number', align: 'right', value: (r) => change(r.current.revenue, r.previous.revenue) },
];

function GroupTable({ tableId, title, rows, icon }: { tableId: string; title: string; rows: GroupRow[]; icon?: (name: string, sub?: string | null) => React.ElementType }) {
  const [all, setAll] = useState(false);
  const ctl = useTableControls<GroupRow>(tableId, rows, GROUP_COLS);
  const shown = all ? ctl.rows : ctl.rows.slice(0, 10);
  return (
    <section className="rounded-2xl border border-line bg-surface overflow-hidden">
      <h2 className="px-4 pt-4 pb-2 text-[15px] font-bold text-ink">{title}</h2>
      {rows.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] text-muted">Aucun extra réalisé sur la période.</p>
      ) : (
        <>
          <TableFilterSummary ctl={ctl} className="px-4 pb-2" />
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-line">
                <tr>
                  <th className={th}><ColumnHeader ctl={ctl} col="name" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="count" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="revenue" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="margin" /></th>
                  <th className={cn(th, 'text-right')}><ColumnHeader ctl={ctl} col="change" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => {
                  const Icon = icon?.(r.name, r.sub);
                  const rate = r.current.revenue ? r.current.margin / r.current.revenue : null;
                  return (
                    <tr key={r.key}>
                      <td className="px-3 py-2.5 text-[13px] text-ink max-w-[260px]">
                        <span className="flex items-center gap-2 min-w-0">
                          {Icon && <Icon size={14} className="shrink-0 text-muted" />}
                          <span className="truncate" title={r.name}>
                            {r.name}
                          </span>
                        </span>
                      </td>
                      <td className={cn(td, 'text-right')}>{r.current.count}</td>
                      <td className={cn(td, 'text-right')}>{mad(r.current.revenue)}</td>
                      <td className={cn(td, 'text-right')}>
                        {mad(r.current.margin)}
                        {!r.current.costKnown && <span title="Coût prestataire en partie inconnu : estimé (prix − commission)"> *</span>}
                        {rate != null && <span className="block text-[11px] text-muted">{pct(rate)}</span>}
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <Delta cur={r.current.revenue} prev={r.previous.revenue} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {ctl.rows.length > 10 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="px-4 py-3 text-[12.5px] font-semibold text-accent hover:underline">
          {all ? 'Voir moins' : `Voir les ${ctl.rows.length - 10} autres`}
        </button>
      )}
    </section>
  );
}

/** Occupancy, price per night, extras and margins per house, compared with last year. */
export function PerformancePage() {
  const [kind, setKind] = useState<Kind>('month');
  const [date, setDate] = useState(iso(new Date()));
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['performance', kind, date],
    queryFn: async () => {
      const r = await apiClient.get('/finance/performance', { params: { period: kind, date }, timeout: 60_000 });
      return (r.data?.data ?? r.data) as Report;
    },
    placeholderData: (prev) => prev,
  });
  const atToday = useMemo(() => shift(date, kind, 1) > iso(new Date()), [date, kind]);
  const c = data?.totals.current;
  const p = data?.totals.previous;
  // Sort and filter at the top of the columns (as in Excel), one state per table.
  const houseCtl = useTableControls<House>('performance-villas', data?.houses ?? [], HOUSE_COLS);
  const activityRows = useMemo<GroupRow[]>(() => (data?.activities ?? []).map((a) => ({ key: a.key, name: a.name, sub: a.category, current: a.current, previous: a.previous })), [data]);
  const providerRows = useMemo<GroupRow[]>(() => (data?.providers ?? []).map((x) => ({ key: x.id, name: x.name, current: x.current, previous: x.previous })), [data]);

  return (
    <div className="space-y-5 max-w-[1400px]">
      <PageHeader title="Performance des villas" description="Occupation, prix moyen par nuit, extras et marges, comparés à la même période l’an dernier. Montants en dirhams au taux du jour." />

      <div className="flex flex-wrap items-center gap-3">
        <div className={segTrack}>
          {(['month', 'quarter', 'year'] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(segItem, kind === k ? segOn : segOff)}
            >
              {k === 'month' ? 'Mois' : k === 'quarter' ? 'Trimestre' : 'Année'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDate(shift(date, kind, -1))} className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label="Période précédente">
            <ChevronLeft size={16} />
          </button>
          <p className={cn('text-[15px] font-bold text-ink min-w-[220px] text-center first-letter:uppercase', isFetching && 'opacity-60')}>
            {data ? label(data.kind, data.period.start, data.period.end, data.period.complete) : '…'}
          </p>
          <button
            type="button"
            disabled={atToday}
            onClick={() => setDate(shift(date, kind, 1))}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2 disabled:opacity-30"
            aria-label="Période suivante"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        {data && (
          <p className="text-[12px] text-muted">
            Comparé du {new Date(`${data.previousPeriod.start}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })} au{' '}
            {new Date(`${data.previousPeriod.end}T00:00:00Z`).toLocaleDateString('fr-FR', { timeZone: 'UTC' })}
            {data.fx?.eurToMad ? ` · 1 € = ${data.fx.eurToMad.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} MAD` : ''}
          </p>
        )}
      </div>

      {isLoading || !data || !c || !p ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            <Kpi title="Occupation" value={pct(c.occupancy)} cur={c.occupancy} prev={p.occupancy} rate hint={`${c.nightsSold} nuits occupées sur ${c.nightsAvailable}`} />
            <Kpi title="Prix moyen / nuit" value={mad(c.adr)} cur={c.adr} prev={p.adr} hint="CA hébergement ÷ nuits des séjours qui ont un montant" />
            <Kpi title="RevPAR" value={mad(c.revpar)} cur={c.revpar} prev={p.revpar} hint="CA hébergement ÷ nuits disponibles" />
            <Kpi title="CA hébergement" value={mad(c.accommodationRevenue)} cur={c.accommodationRevenue} prev={p.accommodationRevenue} />
            <Kpi title="CA extras" value={mad(c.extrasRevenue)} cur={c.extrasRevenue} prev={p.extrasRevenue} hint={`${c.extrasCount} extras réalisés`} />
            <Kpi title="Extras par séjour" value={mad(c.extrasPerStay)} cur={c.extrasPerStay} prev={p.extrasPerStay} hint={`${c.stays} séjours`} />
            <Kpi title="Marge extras" value={mad(c.extrasMargin)} cur={c.extrasMargin} prev={p.extrasMargin} hint="Prix client − coût prestataire" />
          </div>

          <section className="rounded-2xl border border-line bg-surface overflow-hidden">
            <h2 className="px-4 pt-4 pb-2 text-[15px] font-bold text-ink">Par villa</h2>
            <TableFilterSummary ctl={houseCtl} noun="villa" className="px-4 pb-2" />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead className="border-b border-line">
                  <tr>
                    <th className={th}><ColumnHeader ctl={houseCtl} col="villa" /></th>
                    <th className={th}><ColumnHeader ctl={houseCtl} col="occupancy" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="nights" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="adr" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="revpar" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="accommodation" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="extras" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="extrasPerStay" /></th>
                    <th className={cn(th, 'text-right')}><ColumnHeader ctl={houseCtl} col="margin" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {houseCtl.rows.map((h) => (
                    <tr key={h.id} className="hover:bg-surface-2/40">
                      <td className="px-3 py-2.5 text-[13px] max-w-[240px]">
                        <Link to={`/villas/${h.id}`} className="font-semibold text-ink hover:underline truncate block" title={h.name}>
                          {h.name}
                        </Link>
                        <span className="text-[11.5px] text-muted inline-flex items-center gap-1">
                          {h.city}
                          {h.formulas > 0 && (
                            <>
                              {' · '}
                              <Layers size={11} /> {h.formulas + 1} formules
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <OccupancyBar value={h.current.occupancy} />
                        <Delta cur={h.current.occupancy} prev={h.previous.occupancy} rate />
                      </td>
                      <td className={cn(td, 'text-right')}>
                        {h.current.nightsSold}
                        <span className="text-muted">/{h.current.nightsAvailable}</span>
                      </td>
                      <td className={cn(td, 'text-right')}>
                        {mad(h.current.adr)}
                        <span className="block">
                          <Delta cur={h.current.adr} prev={h.previous.adr} />
                        </span>
                      </td>
                      <td className={cn(td, 'text-right')}>{mad(h.current.revpar)}</td>
                      <td className={cn(td, 'text-right')}>
                        {mad(h.current.accommodationRevenue)}
                        <span className="block">
                          <Delta cur={h.current.accommodationRevenue} prev={h.previous.accommodationRevenue} />
                        </span>
                      </td>
                      <td className={cn(td, 'text-right')}>
                        {mad(h.current.extrasRevenue)}
                        <span className="block">
                          <Delta cur={h.current.extrasRevenue} prev={h.previous.extrasRevenue} />
                        </span>
                      </td>
                      <td className={cn(td, 'text-right')}>{mad(h.current.extrasPerStay)}</td>
                      <td className={cn(td, 'text-right')}>
                        {mad(h.current.extrasMargin)}
                        {h.current.costEstimated && <span title="Coût prestataire en partie inconnu : estimé (prix − commission)"> *</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            <GroupTable tableId="performance-activities" title="Marge par activité" rows={activityRows} icon={(name, sub) => activityKind(name, sub).icon} />
            <GroupTable tableId="performance-providers" title="Marge par prestataire" rows={providerRows} />
          </div>

          <p className="text-[12px] text-muted">
            Nuits comptées sur la période (arrivée incluse, départ exclu) ; une maison et ses formules Lodgify comptent pour une villa. Extras réalisés, datés au jour de la
            prestation. * coût prestataire en partie inconnu, estimé (prix − commission).
            {data.unconverted.length > 0 && ` Devises non converties (taux indisponible) : ${data.unconverted.join(', ')}.`}
          </p>
        </>
      )}
    </div>
  );
}
