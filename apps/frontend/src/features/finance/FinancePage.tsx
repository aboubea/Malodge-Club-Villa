import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, BedDouble, ChevronLeft, ChevronRight, CircleAlert, Download, FileText, Percent, Sparkles, Table, TrendingUp } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { FxNote } from '../../lib/fx';
import { RevenueChart, type SeriesPoint } from './RevenueChart';
import { PayoutsTable, type PayoutRow } from './PayoutsTable';
import { apiClient } from '../../lib/apiClient';
import { cn, formatCurrency } from '../../lib/utils';
import { activityKind } from '../calendar/agendaIcons';

type Period = 'day' | 'week' | 'month' | 'year';
type PayoutsTab = 'provider' | 'owner';

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Jour', value: 'day' },
  { label: 'Semaine', value: 'week' },
  { label: 'Mois', value: 'month' },
  { label: 'Année', value: 'year' },
];

interface Totals {
  revenue: number;
  accommodation: number;
  accommodationUpcoming: number;
  nights: number;
  stays: number;
  extras: number;
  extrasCount: number;
  extrasCost: number;
  extrasMargin: number;
  extrasNoCost: number;
  extrasNoCostCount: number;
}
interface HouseRow {
  id: string;
  name: string;
  accommodation: number;
  extras: number;
  revenue: number;
  nights: number;
  stays: number;
  extrasCount: number;
  extrasMargin: number;
}
interface ActivityRow {
  key: string;
  name: string;
  category: string | null;
  count: number;
  revenue: number;
  cost: number;
  margin: number;
  costKnown: boolean;
}
interface Pipe {
  count: number;
  amount: number;
}
interface Report {
  period: Period;
  range: { start: string; end: string; label: string };
  previousRange: { start: string; end: string; label: string };
  today: string;
  currency: string;
  converted: boolean;
  notConverted: string[];
  currencies: { currency: string; amount: number }[];
  totals: Totals;
  previous: Totals;
  changes: { revenue: number | null; accommodation: number | null; extras: number | null; extrasMargin: number | null };
  series: SeriesPoint[];
  byHouse: HouseRow[];
  byActivity: ActivityRow[];
  pipeline: { confirmed: Pipe; toConfirm: Pipe; overdue: Pipe };
}

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const todayIso = () => {
  const n = new Date();
  return isoDay(new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())));
};
/** The same kind of period, `step` periods away from the one holding `ref`. */
function shift(period: Period, ref: string, step: number): string {
  const d = new Date(`${ref}T00:00:00Z`);
  if (period === 'day') return isoDay(new Date(d.getTime() + step * DAY));
  if (period === 'week') return isoDay(new Date(d.getTime() + step * 7 * DAY));
  if (period === 'month') return isoDay(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + step, 1)));
  return isoDay(new Date(Date.UTC(d.getUTCFullYear() + step, 0, 1)));
}
/** Whole units: a headline figure needs no cents. */
const money = (n: number, currency: string) => formatCurrency(Math.round(n), currency);
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;

async function fetchReport(period: Period, ref: string, currency?: string): Promise<Report> {
  const res = await apiClient.get(`/finance/dashboard?period=${period}&date=${ref}${currency ? `&currency=${currency}` : ''}`);
  return res.data?.data ?? res.data;
}
async function fetchPayouts(kind: 'provider' | 'owner', month: number, year: number, currency?: string) {
  const res = await apiClient.get(`/finance/${kind}-payouts?month=${month}&year=${year}${currency ? `&currency=${currency}` : ''}`);
  return res.data?.data ?? res.data ?? [];
}

/** Change against the period before, with an arrow: never colour alone. */
function Delta({ value, versus }: { value: number | null; versus: string }) {
  if (value == null) return <p className="text-[12px] text-muted mt-2">Rien à comparer ({versus})</p>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="text-[12px] text-muted mt-2 flex items-center gap-1 flex-wrap">
      <span className={cn('inline-flex items-center gap-0.5 font-semibold tabular', up ? 'text-success' : 'text-danger')}>
        <Icon size={13} />
        {up ? '+' : '−'}
        {Math.abs(value).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %
      </span>
      <span>vs {versus}</span>
    </p>
  );
}

function Kpi({ label, icon: Icon, value, sub, delta, versus, swatch, delay, loading }: { label: string; icon: React.ElementType; value: string; sub?: React.ReactNode; delta: number | null; versus: string; swatch?: string; delay: number; loading: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.25 }}>
      <Card className="p-5 h-full">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted flex items-center gap-1.5">
            {swatch && <span className={cn('w-2.5 h-2.5 rounded-[3px]', swatch)} />}
            {label}
          </p>
          <span className="w-8 h-8 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <Icon size={15} className="text-ink-soft" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-40 mt-3" />
        ) : (
          <>
            <p className="font-display font-semibold text-[26px] leading-none tracking-tight text-ink tabular mt-3">{value}</p>
            {sub && <p className="text-[12px] text-ink-soft mt-2">{sub}</p>}
            <Delta value={delta} versus={versus} />
          </>
        )}
      </Card>
    </motion.div>
  );
}

/** One villa: its total, and a bar split between accommodation and extras (2 px gap). */
function HouseLine({ h, max, currency }: { h: HouseRow; max: number; currency: string }) {
  const w = (n: number) => `${max > 0 ? (n / max) * 100 : 0}%`;
  return (
    <div className="py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        {h.id === 'none' ? (
          <span className="text-[13.5px] font-semibold text-ink-soft italic truncate">Extras sans villa</span>
        ) : (
          <Link to={`/villas/${h.id}`} className="text-[13.5px] font-semibold text-ink truncate hover:underline">
            {h.name}
          </Link>
        )}
        <span className="text-[13.5px] font-semibold text-ink tabular shrink-0">{money(h.revenue, currency)}</span>
      </div>
      <div className="mt-1.5 h-2 flex gap-[2px]" title={`Hébergement ${money(h.accommodation, currency)} · Extras ${money(h.extras, currency)}`}>
        {h.accommodation > 0 && <div className="h-full bg-chart-1 rounded-l-[3px] last:rounded-r-[3px]" style={{ width: w(h.accommodation) }} />}
        {h.extras > 0 && <div className="h-full bg-chart-2 rounded-r-[3px] first:rounded-l-[3px]" style={{ width: w(h.extras) }} />}
      </div>
      <p className="mt-1 text-[11.5px] text-muted tabular">
        {[
          h.nights ? `${plural(h.nights, 'nuit')} · ${money(h.accommodation, currency)}` : h.stays ? plural(h.stays, 'séjour') : null,
          h.extrasCount ? `${plural(h.extrasCount, 'extra')} · ${money(h.extras, currency)}` : null,
        ]
          .filter(Boolean)
          .join('   ·   ')}
      </p>
    </div>
  );
}

function ActivityLine({ a, max, currency }: { a: ActivityRow; max: number; currency: string }) {
  const k = activityKind(a.name, a.category);
  const rate = a.costKnown && a.revenue ? Math.round((a.margin / a.revenue) * 100) : null;
  return (
    <div className="py-2 flex items-center gap-3">
      <span className={cn('w-8 h-8 rounded-lg border flex items-center justify-center shrink-0', k.tone)}>
        <k.icon size={15} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13.5px] text-ink truncate">{a.name}</p>
          <p className="text-[13.5px] font-semibold text-ink tabular shrink-0">{money(a.revenue, currency)}</p>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-chart-2 rounded-full" style={{ width: `${max > 0 ? (a.revenue / max) * 100 : 0}%` }} />
        </div>
        <p className="mt-1 text-[11.5px] text-muted tabular">
          {a.count} × · {rate != null ? `marge ${money(a.margin, currency)} (${rate} %)` : 'coût à renseigner : marge non comptée'}
        </p>
      </div>
    </div>
  );
}

export function FinancePage() {
  const [period, setPeriod] = useState<Period>('month');
  const [ref, setRef] = useState(todayIso);
  const [payoutsTab, setPayoutsTab] = useState<PayoutsTab>('provider');
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [allHouses, setAllHouses] = useState(false);
  const [allActivities, setAllActivities] = useState(false);
  // By default every currency converted to dirhams; one currency alone, unconverted, on demand.
  const [askedCurrency, setAskedCurrency] = useState<string | undefined>(undefined);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['finance-dashboard', period, ref, askedCurrency],
    queryFn: () => fetchReport(period, ref, askedCurrency),
    placeholderData: (prev) => prev,
  });
  const currency = data?.currency ?? 'MAD';
  const t = data?.totals;
  const versus = data?.previousRange.label ?? 'période précédente';
  const isCurrent = !!data && data.today >= data.range.start && data.today <= data.range.end;

  // Payouts: the month of the period shown.
  const refDate = new Date(`${ref}T00:00:00Z`);
  const payMonth = refDate.getUTCMonth() + 1;
  const payYear = refDate.getUTCFullYear();
  const payLabel = refDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const { data: providerPayouts = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['provider-payouts', payMonth, payYear, askedCurrency],
    queryFn: () => fetchPayouts('provider', payMonth, payYear, askedCurrency),
  });
  const { data: ownerPayouts = [], isLoading: loadingOwners } = useQuery({
    queryKey: ['owner-payouts', payMonth, payYear, askedCurrency],
    queryFn: () => fetchPayouts('owner', payMonth, payYear, askedCurrency),
  });

  async function handleExport(format: 'pdf' | 'excel' | 'csv') {
    setIsExporting(format);
    try {
      const response = await apiClient.get(`/finance/export?period=${period}&date=${ref}&format=${format}${askedCurrency ? `&currency=${askedCurrency}` : ''}`, { responseType: 'blob' });
      const ext = format === 'excel' ? 'xlsx' : format;
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `finances-${data?.range.start ?? ref}-${period}-${currency}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // toast shown by the apiClient interceptor
    } finally {
      setIsExporting(null);
    }
  }

  const providerRows: PayoutRow[] = providerPayouts
    .filter((p: any) => (p.currency ?? 'EUR') === currency)
    .map((p: any) => ({ id: p.providerId, name: p.name, grossAmount: p.grossAmount, commission: p.commission, netAmount: p.netAmount, orderCount: p.orderCount }));
  const ownerRows: PayoutRow[] = ownerPayouts
    .filter((o: any) => (o.currency ?? 'EUR') === currency)
    .map((o: any) => ({ id: o.villaId, name: `${o.name} — ${o.ownerName}`, grossAmount: o.grossAmount, managementFee: o.managementFee, netAmount: o.netAmount, stayCount: o.stayCount }));

  const houses = data?.byHouse ?? [];
  const activities = data?.byActivity ?? [];
  const maxHouse = Math.max(0, ...houses.map((h) => h.revenue));
  const maxActivity = Math.max(0, ...activities.map((a) => a.revenue));
  const marginRate = t && t.extras - t.extrasNoCost > 0 ? Math.round((t.extrasMargin / (t.extras - t.extrasNoCost)) * 100) : null;
  const pipe = data?.pipeline;
  const pending = pipe ? pipe.confirmed.count + pipe.toConfirm.count + pipe.overdue.count : 0;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <PageHeader title="Finances" description="Chiffre d’affaires des séjours et des extras, marges et reversements">
        <Button variant="secondary" size="sm" icon={<FileText size={13} />} loading={isExporting === 'pdf'} onClick={() => handleExport('pdf')}>
          PDF
        </Button>
        <Button variant="secondary" size="sm" icon={<Table size={13} />} loading={isExporting === 'excel'} onClick={() => handleExport('excel')}>
          Excel
        </Button>
        <Button variant="secondary" size="sm" icon={<Download size={13} />} loading={isExporting === 'csv'} onClick={() => handleExport('csv')}>
          CSV
        </Button>
      </PageHeader>

      {/* Period: kind, then back and forth */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-surface border border-line rounded-full p-1" role="group" aria-label="Période">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              className={cn('px-3.5 h-8 text-[12.5px] rounded-full transition-colors', period === p.value ? 'bg-primary text-on-primary font-semibold' : 'text-muted hover:text-ink')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setRef((r) => shift(period, r, -1))} aria-label="Période précédente" className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft hover:text-ink">
            <ChevronLeft size={16} />
          </button>
          <p className={cn('min-w-[150px] text-center text-[15px] font-bold text-ink capitalize', isFetching && 'opacity-60')}>{data?.range.label ?? '…'}</p>
          <button type="button" onClick={() => setRef((r) => shift(period, r, 1))} aria-label="Période suivante" className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft hover:text-ink">
            <ChevronRight size={16} />
          </button>
        </div>
        {!isCurrent && data && (
          <button type="button" onClick={() => setRef(todayIso())} className="h-9 px-4 rounded-full border border-line bg-surface text-[12.5px] font-semibold text-ink">
            Aujourd’hui
          </button>
        )}
        {data && (data.currencies.length > 1 || data.currencies.some((c) => c.currency !== 'MAD')) && (
          <div className="ml-auto flex items-center gap-1 bg-surface border border-line rounded-full p-1" role="group" aria-label="Devises comptées">
            <button
              type="button"
              onClick={() => setAskedCurrency(undefined)}
              title="Toutes les devises, converties en dirhams au taux du jour"
              className={cn('px-3 h-8 text-[12px] rounded-full', !askedCurrency ? 'bg-primary text-on-primary font-semibold' : 'text-muted hover:text-ink')}
            >
              Toutes devises
            </button>
            {data.currencies.map((c) => (
              <button
                key={c.currency}
                type="button"
                onClick={() => setAskedCurrency(c.currency)}
                title={`Seulement les villas en ${c.currency}, sans conversion`}
                className={cn('px-3 h-8 text-[12px] rounded-full', askedCurrency === c.currency ? 'bg-primary text-on-primary font-semibold' : 'text-muted hover:text-ink')}
              >
                {c.currency} seul
              </button>
            ))}
          </div>
        )}
      </div>
      {data?.converted && data.currencies.some((c) => c.currency !== 'MAD') && <FxNote className="block -mt-2 text-[12px] text-muted" />}

      {/* Headline figures: revenue = accommodation + extras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi
          label="Chiffre d’affaires"
          icon={TrendingUp}
          value={t ? money(t.revenue, currency) : '—'}
          sub={t && t.accommodationUpcoming > 0 ? `dont ${money(t.accommodationUpcoming, currency)} de nuits à venir` : 'Hébergement + extras réalisés'}
          delta={data?.changes.revenue ?? null}
          versus={versus}
          delay={0}
          loading={isLoading}
        />
        <Kpi
          label="Hébergement"
          icon={BedDouble}
          swatch="bg-chart-1"
          value={t ? money(t.accommodation, currency) : '—'}
          sub={t ? `${plural(t.nights, 'nuit')} · ${plural(t.stays, 'séjour')}` : undefined}
          delta={data?.changes.accommodation ?? null}
          versus={versus}
          delay={0.04}
          loading={isLoading}
        />
        <Kpi
          label="Extras réalisés"
          icon={Sparkles}
          swatch="bg-chart-2"
          value={t ? money(t.extras, currency) : '—'}
          sub={t ? `${plural(t.extrasCount, 'extra')}${pipe && pipe.confirmed.count + pipe.toConfirm.count ? ` · ${plural(pipe.confirmed.count + pipe.toConfirm.count, 'autre')} prévu${pipe.confirmed.count + pipe.toConfirm.count > 1 ? 's' : ''}` : ''}` : undefined}
          delta={data?.changes.extras ?? null}
          versus={versus}
          delay={0.08}
          loading={isLoading}
        />
        <Kpi
          label="Marge des extras"
          icon={Percent}
          value={t ? money(t.extrasMargin, currency) : '—'}
          sub={
            t ? (
              <>
                {marginRate != null ? `${marginRate} % des extras au coût connu` : 'Prix − coût prestataire'}
                {t.extrasNoCostCount > 0 && (
                  <span className="block text-warning">
                    {money(t.extrasNoCost, currency)} sans coût ({plural(t.extrasNoCostCount, 'ligne')}) : hors marge
                  </span>
                )}
              </>
            ) : undefined
          }
          delta={data?.changes.extrasMargin ?? null}
          versus={versus}
          delay={0.12}
          loading={isLoading}
        />
      </div>

      {/* Extras of the period not in the revenue yet */}
      {pipe && pending > 0 && (
        <div className="rounded-2xl border border-line bg-surface px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-soft">
          <span className="font-semibold text-ink">Pas encore dans le chiffre d’affaires :</span>
          {pipe.confirmed.count > 0 && <span>{plural(pipe.confirmed.count, 'extra confirmé', 'extras confirmés')} à venir · {money(pipe.confirmed.amount, currency)}</span>}
          {pipe.toConfirm.count > 0 && <span>{plural(pipe.toConfirm.count, 'demande')} à confirmer · {money(pipe.toConfirm.amount, currency)}</span>}
          {pipe.overdue.count > 0 && (
            <span className="inline-flex items-center gap-1 text-warning font-semibold">
              <CircleAlert size={14} />
              {plural(pipe.overdue.count, 'extra passé', 'extras passés')} non clôturé{pipe.overdue.count > 1 ? 's' : ''} · {money(pipe.overdue.amount, currency)}
            </span>
          )}
          <Link to="/extras" className="ml-auto font-semibold text-accent hover:underline">
            Suivi des extras →
          </Link>
        </div>
      )}

      {/* Revenue over the period */}
      {period !== 'day' && (
        <Card>
          <CardHeader>
            <CardTitle>{period === 'year' ? 'Chiffre d’affaires par mois' : 'Chiffre d’affaires par jour'}</CardTitle>
          </CardHeader>
          <CardContent>{isLoading ? <Skeleton className="h-60 w-full" /> : <RevenueChart data={data?.series ?? []} currency={currency} perMonth={period === 'year'} />}</CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Par villa</CardTitle>
            <span className="hidden sm:flex items-center gap-3 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-[2px] bg-chart-1" /> Hébergement
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="w-2 h-2 rounded-[2px] bg-chart-2" /> Extras
              </span>
            </span>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : houses.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">Aucun séjour ni extra sur cette période</p>
            ) : (
              <>
                <div className="divide-y divide-line">
                  {(allHouses ? houses : houses.slice(0, 8)).map((h) => (
                    <HouseLine key={h.id} h={h} max={maxHouse} currency={currency} />
                  ))}
                </div>
                {houses.length > 8 && (
                  <button type="button" onClick={() => setAllHouses((v) => !v)} className="mt-1 text-[12.5px] font-semibold text-accent hover:underline">
                    {allHouses ? 'Voir moins' : `Voir les ${houses.length - 8} autres`}
                  </button>
                )}
                {/* The villas add up to the headline figure */}
                <div className="mt-2 pt-2.5 border-t border-line-strong flex items-baseline justify-between text-[13.5px] font-bold text-ink">
                  <span>Total ({plural(houses.filter((h) => h.id !== 'none').length, 'villa')})</span>
                  <span className="tabular">{t ? money(t.revenue, currency) : '—'}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Extras par activité</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">Aucun extra réalisé sur cette période</p>
            ) : (
              <>
                <div className="divide-y divide-line">
                  {(allActivities ? activities : activities.slice(0, 8)).map((a) => (
                    <ActivityLine key={a.key} a={a} max={maxActivity} currency={currency} />
                  ))}
                </div>
                {activities.length > 8 && (
                  <button type="button" onClick={() => setAllActivities((v) => !v)} className="mt-1 text-[12.5px] font-semibold text-accent hover:underline">
                    {allActivities ? 'Voir moins' : `Voir les ${activities.length - 8} autres`}
                  </button>
                )}
                <div className="mt-2 pt-2.5 border-t border-line-strong flex items-baseline justify-between text-[13.5px] font-bold text-ink">
                  <span>Total extras</span>
                  <span className="tabular">{t ? money(t.extras, currency) : '—'}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payouts of the month */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle>
            Reversements · <span className="capitalize">{payLabel}</span>
          </CardTitle>
          <div className="flex items-center gap-1 bg-canvas border border-line rounded-full p-1">
            {(['provider', 'owner'] as PayoutsTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setPayoutsTab(tab)}
                className={cn('px-4 h-8 text-[12px] rounded-full transition-colors', payoutsTab === tab ? 'bg-surface text-ink font-semibold border border-line' : 'text-muted hover:text-ink')}
              >
                {tab === 'provider' ? 'Prestataires' : 'Propriétaires'}
              </button>
            ))}
          </div>
        </CardHeader>
        {(payoutsTab === 'provider' ? loadingProviders : loadingOwners) ? (
          <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : (
          <PayoutsTable type={payoutsTab} data={payoutsTab === 'provider' ? providerRows : ownerRows} currency={currency} />
        )}
      </Card>
    </div>
  );
}
