import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Moon, Pencil, ShoppingBag, Users } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatCurrency, formatDay } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SlideOver } from '../../components/ui/SlideOver';
import { Skeleton } from '../../components/ui/Skeleton';

/* ───────────────────────────── Types & helpers ───────────────────────────── */

export interface TimelineStay {
  id: string;
  label?: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  totalAmount: number;
  currency?: string | null;
  guests?: number | null;
  source?: string | null;
  logifyId?: string | null;
  notes?: string | null;
  villaId: string;
  villa: { id: string; name: string; city: string; coverImage?: string | null; currency?: string };
  client: { id: string; firstName: string; lastName: string; email?: string; phone?: string | null };
  _count?: { orders: number };
}

interface VillaRow {
  id: string;
  name: string;
  city: string;
  coverImage?: string | null;
}

const DAY = 86_400_000;
/** Calendar days are UTC days (stay dates are stored at 00:00 UTC). */
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const todayUtc = () => {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
};
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const nights = (s: TimelineStay) => (s.checkIn && s.checkOut ? Math.round((utcDay(new Date(s.checkOut)) - utcDay(new Date(s.checkIn))) / DAY) : 0);
const guestName = (s: TimelineStay) => s.label || [s.client?.firstName, s.client?.lastName].filter(Boolean).join(' ') || 'Client';
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

const STATUS: Record<string, { label: string; bar: string; badge: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' }> = {
  PENDING: { label: 'En attente', bar: 'bg-peach text-ink ring-1 ring-inset ring-accent/40', badge: 'pending' },
  CONFIRMED: { label: 'Confirmée', bar: 'bg-primary text-on-primary', badge: 'confirmed' },
  ACTIVE: { label: 'En cours', bar: 'bg-success text-white', badge: 'active' },
  COMPLETED: { label: 'Terminée', bar: 'bg-surface-2 text-ink-soft ring-1 ring-inset ring-line-strong', badge: 'completed' },
  CANCELLED: { label: 'Annulée', bar: 'bg-danger/10 text-danger line-through ring-1 ring-inset ring-danger/30', badge: 'cancelled' },
};

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
/** Placeholder addresses of records without app access are not contacts. */
const realEmail = (e?: string | null) => !!e && !/\.(local|invalid)$/i.test(e);
const MONTH = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Stays of one villa spread over as few lines as possible (overlaps go below). */
function lanes(stays: TimelineStay[]) {
  const sorted = [...stays].sort((a, b) => utcDay(new Date(a.checkIn!)) - utcDay(new Date(b.checkIn!)));
  const ends: number[] = [];
  return sorted.map((s) => {
    const start = utcDay(new Date(s.checkIn!));
    // Same-day turnover (one leaves, the next arrives) shares the line, as on Airbnb.
    let lane = ends.findIndex((end) => end <= start);
    if (lane === -1) lane = ends.push(0) - 1;
    ends[lane] = utcDay(new Date(s.checkOut!));
    return { stay: s, lane };
  });
}

/* ─────────────────────────────── Component ─────────────────────────────── */

const COL = 46; // px per day
const ROW = 36; // px per line of stays
const NAME_WIDE = 220;
const NAME_NARROW = 124;

export function ReservationsTimeline({ country, onEdit }: { country?: string; onEdit?: (stay: TimelineStay) => void }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const span = wide ? 35 : 21;
  const NAME_COL = wide ? NAME_WIDE : NAME_NARROW;
  const [start, setStart] = useState(() => todayUtc() - 3 * DAY);
  const [showCancelled, setShowCancelled] = useState(false);
  const [onlyBooked, setOnlyBooked] = useState(false);
  const [selected, setSelected] = useState<TimelineStay | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(() => Array.from({ length: span }, (_, i) => start + i * DAY), [start, span]);
  const from = iso(days[0]);
  const to = iso(days[days.length - 1]);
  const today = todayUtc();

  const { data: villas = [], isLoading: loadingVillas } = useQuery({
    queryKey: ['villas', 'timeline', country],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '300', isActive: 'true' });
      if (country) params.set('country', country);
      const res = await apiClient.get(`/villas?${params}`);
      const d = res.data?.data ?? res.data;
      return ((d?.data ?? d) as VillaRow[]).sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 60_000,
  });

  const { data: stays = [], isLoading: loadingStays } = useQuery({
    queryKey: ['reservations', 'timeline', from, to, country],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (country) params.set('country', country);
      const res = await apiClient.get(`/reservations?${params}`);
      const d = res.data?.data ?? res.data;
      return (d?.data ?? d) as TimelineStay[];
    },
    placeholderData: (prev) => prev,
  });

  const { data: undated = [] } = useQuery({
    queryKey: ['reservations', 'undated', country],
    queryFn: async () => {
      const params = new URLSearchParams({ undated: 'true' });
      if (country) params.set('country', country);
      const res = await apiClient.get(`/reservations?${params}`);
      const d = res.data?.data ?? res.data;
      return (d?.data ?? d) as TimelineStay[];
    },
  });

  // Back to the left edge when the window moves.
  useEffect(() => {
    scroller.current?.scrollTo({ left: 0 });
  }, [start]);

  const visible = stays.filter((s) => s.checkIn && s.checkOut && (showCancelled || s.status !== 'CANCELLED'));
  const byVilla = new Map<string, TimelineStay[]>();
  for (const s of visible) byVilla.set(s.villaId ?? s.villa?.id, [...(byVilla.get(s.villaId ?? s.villa?.id) ?? []), s]);
  // Villas that only appear through a stay (inactive, or filtered out) still get their line.
  const rows: VillaRow[] = [...villas];
  for (const s of visible) if (!rows.some((v) => v.id === (s.villaId ?? s.villa?.id))) rows.push(s.villa);
  const shownRows = onlyBooked ? rows.filter((v) => byVilla.has(v.id)) : rows;

  const occupiedNights = (villaId: string) =>
    (byVilla.get(villaId) ?? []).reduce((sum, s) => {
      const a = Math.max(utcDay(new Date(s.checkIn!)), days[0]);
      const b = Math.min(utcDay(new Date(s.checkOut!)), days[days.length - 1] + DAY);
      return s.status === 'CANCELLED' ? sum : sum + Math.max(0, Math.round((b - a) / DAY));
    }, 0);

  const monthLabel = (() => {
    const first = MONTH.format(new Date(days[0]));
    const last = MONTH.format(new Date(days[days.length - 1]));
    return first === last ? first : `${first.split(' ')[0]} – ${last}`;
  })();

  const width = days.length * COL;
  const loading = loadingVillas || loadingStays;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStart((s) => s - 14 * DAY)}
            className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft hover:text-ink hover:border-line-strong"
            aria-label="Deux semaines plus tôt"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setStart(todayUtc() - 3 * DAY)}
            className="h-9 px-4 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:border-line-strong"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={() => setStart((s) => s + 14 * DAY)}
            className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft hover:text-ink hover:border-line-strong"
            aria-label="Deux semaines plus tard"
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <p className="text-[16px] font-bold text-ink capitalize ml-1">{monthLabel}</p>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-[12.5px] text-ink-soft">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={onlyBooked} onChange={(e) => setOnlyBooked(e.target.checked)} />
            Villas réservées seulement
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} />
            Annulées
          </label>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
        {(['CONFIRMED', 'PENDING', 'ACTIVE', 'COMPLETED'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span className={cn('w-5 h-2.5 rounded-full', STATUS[k].bar)} />
            {STATUS[k].label}
          </span>
        ))}
        <span>Les barres vont de l’arrivée (après-midi) au départ (matin), comme sur Airbnb.</span>
      </div>

      {/* Grid */}
      <div className="rounded-2xl border border-line bg-surface overflow-hidden">
        <div ref={scroller} className="overflow-x-auto">
          <div style={{ width: NAME_COL + width }} className="relative">
            {/* Header */}
            <div className="flex sticky top-0 z-20 bg-surface border-b border-line">
              <div style={{ width: NAME_COL }} className="sticky left-0 z-30 bg-surface shrink-0 px-4 flex items-end pb-2 border-r border-line">
                <span className="text-[12px] font-semibold text-muted">{shownRows.length} villa{shownRows.length > 1 ? 's' : ''}</span>
              </div>
              {days.map((t) => {
                const d = new Date(t);
                const isToday = t === today;
                const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                const firstOfMonth = d.getUTCDate() === 1;
                return (
                  <div
                    key={t}
                    style={{ width: COL }}
                    className={cn('shrink-0 py-2 text-center relative', weekend && 'bg-surface-2/60', firstOfMonth && 'border-l border-line-strong')}
                  >
                    {firstOfMonth && (
                      <span className="absolute -top-0.5 left-1 text-[9.5px] font-bold uppercase tracking-wide text-accent">
                        {new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(d)}
                      </span>
                    )}
                    <p className="text-[10.5px] text-muted mt-1.5">{WEEKDAYS[d.getUTCDay()]}</p>
                    <p
                      className={cn(
                        'mx-auto mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-semibold tabular',
                        isToday ? 'bg-accent text-on-accent' : 'text-ink',
                      )}
                    >
                      {d.getUTCDate()}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Rows */}
            {loading && !stays.length ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-xl" />
                ))}
              </div>
            ) : shownRows.length === 0 ? (
              <div className="py-16 text-center text-[13px] text-muted">Aucune villa à afficher.</div>
            ) : (
              shownRows.map((v) => {
                const placed = lanes(byVilla.get(v.id) ?? []);
                const lineCount = Math.max(1, ...placed.map((p) => p.lane + 1));
                const height = lineCount * ROW + 14;
                const occ = occupiedNights(v.id);
                return (
                  <div key={v.id} className="flex border-b border-line last:border-b-0 group/row">
                    <div
                      style={{ width: NAME_COL, minHeight: height }}
                      className="sticky left-0 z-10 bg-surface shrink-0 px-3 py-2 flex items-center gap-2.5 border-r border-line group-hover/row:bg-surface-2/40"
                    >
                      {wide && (
                        <span className="w-9 h-9 rounded-lg overflow-hidden bg-surface-2 shrink-0 flex items-center justify-center">
                          {v.coverImage ? <img src={v.coverImage} alt="" className="w-full h-full object-cover" /> : <Building2 size={15} className="text-line-strong" />}
                        </span>
                      )}
                      <span className="min-w-0">
                        <Link to={`/villas/${v.id}`} className="block text-[13px] font-semibold text-ink truncate hover:underline">
                          {v.name}
                        </Link>
                        <span className="block text-[11.5px] text-muted truncate">
                          {occ > 0 ? `${occ} nuit${occ > 1 ? 's' : ''} réservée${occ > 1 ? 's' : ''}` : v.city}
                        </span>
                      </span>
                    </div>
                    <div style={{ width, height }} className="relative shrink-0">
                      {/* Day cells */}
                      <div className="absolute inset-0 flex">
                        {days.map((t) => {
                          const d = new Date(t);
                          const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                          return (
                            <div
                              key={t}
                              style={{ width: COL }}
                              className={cn(
                                'shrink-0 border-r border-line/60',
                                weekend && 'bg-surface-2/40',
                                t === today && 'bg-accent/[0.07]',
                                d.getUTCDate() === 1 && 'border-l border-line-strong',
                              )}
                            />
                          );
                        })}
                      </div>
                      {/* Stays */}
                      {placed.map(({ stay: s, lane }) => {
                        const a = utcDay(new Date(s.checkIn!));
                        const b = utcDay(new Date(s.checkOut!));
                        const startIdx = (a - days[0]) / DAY + 0.5;
                        const endIdx = (b - days[0]) / DAY + 0.5;
                        const left = Math.max(startIdx, 0) * COL;
                        const right = Math.min(endIdx, days.length) * COL;
                        if (right <= 0 || left >= width) return null;
                        const cutLeft = startIdx < 0;
                        const cutRight = endIdx > days.length;
                        const name = guestName(s);
                        const n = nights(s);
                        const past = b < today;
                        const w = Math.max(right - left, 18);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelected(s)}
                            title={`${name} · ${formatDay(s.checkIn)} → ${formatDay(s.checkOut)}`}
                            style={{ left, width: w, top: 7 + lane * ROW, height: ROW - 6 }}
                            className={cn(
                              'absolute flex items-center gap-1.5 pl-1 pr-2.5 text-left text-[12px] font-semibold shadow-sm transition-transform hover:-translate-y-px hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                              STATUS[s.status]?.bar ?? STATUS.CONFIRMED.bar,
                              cutLeft ? 'rounded-l-md' : 'rounded-l-full',
                              cutRight ? 'rounded-r-md' : 'rounded-r-full',
                              past && 'opacity-55',
                            )}
                          >
                            {w > 60 && (
                              <span className="w-[22px] h-[22px] rounded-full bg-surface text-ink text-[10px] font-bold flex items-center justify-center shrink-0">
                                {initials(name)}
                              </span>
                            )}
                            {w > 90 && <span className="truncate">{name}</span>}
                            {w > 170 && <span className="ml-auto shrink-0 opacity-75 font-medium">{n} n.</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Stays whose dates are not known: never placed on invented days */}
      {undated.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-4">
          <p className="text-[13.5px] font-bold text-ink">
            {undated.length} séjour{undated.length > 1 ? 's' : ''} sans dates
          </p>
          <p className="text-[12.5px] text-muted mt-0.5">Dates non renseignées : ils apparaîtront sur le calendrier dès qu’elles seront saisies.</p>
          <div className="flex flex-wrap gap-2 mt-3">
            {undated.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                className="h-8 px-3 inline-flex items-center gap-2 rounded-full border border-line bg-surface-2/50 text-[12.5px] text-ink hover:border-line-strong"
              >
                <b>{guestName(s)}</b>
                <span className="text-muted">{s.villa?.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <StayPanel
        stay={selected}
        onClose={() => setSelected(null)}
        onEdit={
          onEdit
            ? (s) => {
                setSelected(null);
                onEdit(s);
              }
            : undefined
        }
      />
    </div>
  );
}

/* ─────────────────────────────── Detail panel ─────────────────────────────── */

function StayPanel({ stay, onClose, onEdit }: { stay: TimelineStay | null; onClose: () => void; onEdit?: (s: TimelineStay) => void }) {
  const s = stay;
  const n = s ? nights(s) : 0;
  const currency = s?.currency || s?.villa?.currency || 'EUR';
  const fromLodgify = !!s?.logifyId || s?.source === 'lodgify';
  return (
    <SlideOver open={!!s} onClose={onClose} title={s ? guestName(s) : ''} description={s?.villa?.name} size="sm">
      {s && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS[s.status]?.badge ?? 'confirmed'}>{STATUS[s.status]?.label ?? s.status}</Badge>
            <span className="text-[12px] text-muted">{fromLodgify ? 'Réservation Lodgify (lecture seule côté Lodgify)' : 'Séjour saisi dans l’appli'}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface-2/60 p-3.5">
              <p className="text-[11.5px] text-muted">Arrivée</p>
              <p className="text-[15px] font-bold text-ink mt-0.5">{s.checkIn ? formatDay(s.checkIn) : 'Non renseignée'}</p>
            </div>
            <div className="rounded-2xl bg-surface-2/60 p-3.5">
              <p className="text-[11.5px] text-muted">Départ</p>
              <p className="text-[15px] font-bold text-ink mt-0.5">{s.checkOut ? formatDay(s.checkOut) : 'Non renseigné'}</p>
            </div>
          </div>

          <ul className="space-y-2.5 text-[13px] text-ink-soft">
            {n > 0 && (
              <li className="flex items-center gap-2.5">
                <Moon size={15} className="text-muted" /> {n} nuit{n > 1 ? 's' : ''}
              </li>
            )}
            {/* Extras stays carry no head count: the default 1 is not shown as if it were known. */}
            {!!s.guests && !s.source?.startsWith('extras') && (
              <li className="flex items-center gap-2.5">
                <Users size={15} className="text-muted" /> {s.guests} voyageur{s.guests > 1 ? 's' : ''}
              </li>
            )}
            <li className="flex items-center gap-2.5">
              <CalendarDays size={15} className="text-muted" />
              {s.totalAmount > 0 ? <>Montant du séjour : <b className="text-ink">{formatCurrency(s.totalAmount, currency)}</b></> : 'Montant du séjour non renseigné'}
            </li>
            <li className="flex items-center gap-2.5">
              <ShoppingBag size={15} className="text-muted" />
              {s._count?.orders ?? 0} extra{(s._count?.orders ?? 0) > 1 ? 's' : ''}
              <Link to={`/extras/saisie?stayId=${s.id}&stays=all`} className="ml-auto text-accent font-semibold hover:underline">
                Voir
              </Link>
            </li>
          </ul>

          {(s.client?.phone || realEmail(s.client?.email)) && (
            <div className="rounded-2xl border border-line p-3.5 text-[13px]">
              <p className="text-[11.5px] text-muted mb-1">Contact</p>
              {s.client.phone && <p className="text-ink">{s.client.phone}</p>}
              {realEmail(s.client.email) && <p className="text-ink-soft">{s.client.email}</p>}
            </div>
          )}

          {s.notes && <p className="text-[13px] text-ink-soft whitespace-pre-line">{s.notes}</p>}

          {onEdit && (
            <Button variant="secondary" icon={<Pencil size={13} />} onClick={() => onEdit(s)} className="w-full">
              Modifier la réservation
            </Button>
          )}
        </div>
      )}
    </SlideOver>
  );
}
