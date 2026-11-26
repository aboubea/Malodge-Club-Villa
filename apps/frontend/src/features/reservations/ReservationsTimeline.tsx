import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MadEquivalent } from '../../lib/fx';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Building2, CalendarDays, ChevronLeft, ChevronRight, Moon, Pencil, ShoppingBag, Users } from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatCurrency, formatDay } from '../../lib/utils';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { FindBooking } from './FindBooking';
import { Skeleton } from '../../components/ui/Skeleton';
import { StayInvitePanel } from './StayInvitePanel';

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
  /** Read live from Lodgify (not yet copied into the app). */
  live?: boolean;
  /** Where the booking was made: Airbnb, Booking.com, Direct… */
  channel?: string | null;
  /** A Lodgify enquiry / quote ("Open"): a request, not a stay. */
  enquiry?: boolean;
}

interface VillaRow {
  id: string;
  name: string;
  city: string;
  coverImage?: string | null;
  /** Set on a formula (another Lodgify listing of the same house): shown on its house's line. */
  parentVillaId?: string | null;
  bedrooms?: number;
  maxGuests?: number;
  formulas?: { id: string }[];
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
/** Days rendered on each side of what is shown, to swipe into. */
const LEAD = 28;
/** Days added when a swipe nears the edge of what is rendered. */
const STEP = 28;
/** Days kept rendered: beyond, the far side is dropped (the page stays light). */
const MAX_DAYS = 196;
/** How close to the edge (px) a swipe adds days. */
const EDGE = 10 * COL;

export function ReservationsTimeline({ country, onEdit }: { country?: string; onEdit?: (stay: TimelineStay) => void }) {
  const wide = useMediaQuery('(min-width: 1024px)');
  const NAME_COL = wide ? NAME_WIDE : NAME_NARROW;
  // The days rendered: they grow as the calendar is swiped (touch screen, trackpad,
  // Maj + molette or by dragging with the mouse), the arrows scroll by two weeks.
  const [range, setRange] = useState(() => ({ start: todayUtc() - (3 + LEAD) * DAY, count: LEAD + 63 }));
  // The days on screen: index of the first one in `days`, and how many fit.
  const [view, setView] = useState({ first: LEAD, shown: wide ? 35 : 7 });
  const [showCancelled, setShowCancelled] = useState(false);
  // Lodgify enquiries (quotes) are requests, often next to the real booking: hidden unless asked for.
  const [showEnquiries, setShowEnquiries] = useState(false);
  const [onlyBooked, setOnlyBooked] = useState(false);
  const [selected, setSelected] = useState<TimelineStay | null>(null);
  const [finding, setFinding] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  /** Scroll to apply once the new days are rendered. */
  const pending = useRef<{ left: number; smooth: boolean } | null>({ left: LEAD * COL, smooth: false });
  /** Days added on the left: the scroll moves by as much, so that nothing jumps on screen. */
  const shift = useRef(0);
  const growing = useRef(false);
  const frame = useRef(0);

  const days = useMemo(() => Array.from({ length: range.count }, (_, i) => range.start + i * DAY), [range]);
  const from = iso(days[0]);
  const to = iso(days[days.length - 1]);
  const today = todayUtc();
  // The window on screen (for the month shown and the nights booked per villa).
  const winStart = days[Math.min(view.first, days.length - 1)];
  const winEnd = Math.min(winStart + view.shown * DAY, days[days.length - 1] + DAY);

  /** Reads what is on screen, and adds days when the swipe nears an edge. */
  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    const first = Math.max(0, Math.floor(el.scrollLeft / COL));
    const shown = Math.max(1, Math.floor((el.clientWidth - NAME_COL) / COL));
    setView((v) => (v.first === first && v.shown === shown ? v : { first, shown }));
    if (growing.current) return;
    if (el.scrollLeft + el.clientWidth > el.scrollWidth - EDGE) {
      growing.current = true;
      setRange((r) => {
        if (r.count + STEP <= MAX_DAYS) return { ...r, count: r.count + STEP };
        const drop = r.count + STEP - MAX_DAYS;
        shift.current = -drop * COL;
        return { start: r.start + drop * DAY, count: MAX_DAYS };
      });
    } else if (el.scrollLeft < EDGE) {
      growing.current = true;
      shift.current = STEP * COL;
      setRange((r) => ({ start: r.start - STEP * DAY, count: Math.min(r.count + STEP, MAX_DAYS) }));
    }
  };
  const onScroll = () => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      measure();
    });
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    growing.current = false;
    if (!el) return;
    if (shift.current) el.scrollLeft += shift.current;
    shift.current = 0;
    const p = pending.current;
    pending.current = null;
    if (p) el.scrollTo({ left: p.left, behavior: p.smooth ? 'smooth' : 'auto' });
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);
  useEffect(() => {
    window.addEventListener('resize', onScroll);
    return () => window.removeEventListener('resize', onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Brings day `t` to the left of the screen, smoothly when it is near. */
  const goTo = (t: number, smooth = true) => {
    const el = scroller.current;
    const end = range.start + range.count * DAY;
    const s = Math.min(range.start, t - LEAD * DAY);
    const e = Math.max(end, t + (view.shown + LEAD) * DAY);
    const count = Math.round((e - s) / DAY);
    if (s === range.start && count === range.count) {
      el?.scrollTo({ left: ((t - s) / DAY) * COL, behavior: smooth ? 'smooth' : 'auto' });
      return;
    }
    if (count > MAX_DAYS) {
      // Far away: start again around that day.
      pending.current = { left: LEAD * COL, smooth: false };
      setRange({ start: t - LEAD * DAY, count: LEAD * 2 + view.shown });
      return;
    }
    shift.current = ((range.start - s) / DAY) * COL;
    pending.current = { left: ((t - s) / DAY) * COL, smooth };
    setRange({ start: s, count });
  };

  // ?stay=<id> (from the global search): go to its dates and open it.
  const [params, setParams] = useSearchParams();
  const stayParam = params.get('stay');
  const openedFromLink = useRef<string | null>(null);
  useEffect(() => {
    if (!stayParam || openedFromLink.current === stayParam) return;
    openedFromLink.current = stayParam;
    apiClient
      .get(`/reservations/${stayParam}`)
      .then((r) => {
        const s = (r.data?.data ?? r.data) as TimelineStay & { orders?: unknown[] };
        setSelected({ ...s, _count: s._count ?? { orders: s.orders?.length ?? 0 } } as TimelineStay);
        if (s.checkIn) goTo(utcDay(new Date(s.checkIn)) - 3 * DAY, false);
      })
      .catch(() => undefined)
      .finally(() => {
        const next = new URLSearchParams(params);
        next.delete('stay');
        setParams(next, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stayParam]);

  // Mouse: drag the calendar sideways (touch screens and trackpads swipe it natively).
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || (e.target as HTMLElement).closest('a,button,input,label')) return;
    drag.current = { x: e.clientX, left: scroller.current?.scrollLeft ?? 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !scroller.current) return;
    if (!d.moved && Math.abs(e.clientX - d.x) < 4) return;
    if (!d.moved) {
      d.moved = true;
      scroller.current.setPointerCapture(e.pointerId);
    }
    scroller.current.scrollLeft = d.left - (e.clientX - d.x);
  };
  const endDrag = () => {
    drag.current = null;
  };

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

  // Lodgify bookings read live, so every booking shows even before a sync.
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  type Live = {
    configured: boolean;
    bookings: TimelineStay[];
    unknownProperties: { id: string; name: string; bookings: number }[];
    stats?: { read: number; external: number; inPeriod: number; readAt: string; copied: number | null };
  };
  const { data: live, isFetching: liveLoading } = useQuery({
    queryKey: ['reservations', 'lodgify-live', from, to],
    queryFn: async () => {
      const res = await apiClient.get(`/lodgify/calendar?from=${from}&to=${to}`, { timeout: 45_000 });
      const d = (res.data?.data ?? res.data) as Live;
      // A fresh read was copied into the app: the app's own lists are refreshed too.
      if (d?.stats?.copied) qc.invalidateQueries({ queryKey: ['reservations', 'timeline'] });
      return d;
    },
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: false,
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

  // The app's stays (direct bookings, extras stays, Lodgify copies) plus Lodgify bookings not copied yet.
  const known = new Set(stays.map((s) => s.logifyId).filter(Boolean));
  const allStays = [...stays, ...(live?.bookings ?? []).filter((b) => !known.has(b.logifyId))];
  const visible = allStays.filter(
    (s) => s.checkIn && s.checkOut && (showCancelled || s.status !== 'CANCELLED') && (showEnquiries || !s.enquiry),
  );
  const enquiries = allStays.filter((s) => s.enquiry && s.checkIn && s.checkOut).length;
  // Formulas of a house share its line: a stay booked on a formula is shown on the house.
  const villaInfo = new Map(villas.map((v) => [v.id, v]));
  const houseOf = (villaId: string) => villaInfo.get(villaId)?.parentVillaId ?? villaId;
  const formulaOf = (s: TimelineStay) => {
    const v = villaInfo.get(s.villaId ?? s.villa?.id);
    const house = v?.parentVillaId ? villaInfo.get(v.parentVillaId) : v;
    if (!v || !house?.formulas?.length) return null;
    return [v.bedrooms ? `${v.bedrooms} ch.` : null, v.maxGuests ? `${v.maxGuests} pers.` : null].filter(Boolean).join(' / ') || v.name;
  };
  const byVilla = new Map<string, TimelineStay[]>();
  for (const s of visible) {
    const key = houseOf(s.villaId ?? s.villa?.id);
    byVilla.set(key, [...(byVilla.get(key) ?? []), s]);
  }
  // Villas that only appear through a stay (inactive, or filtered out) still get their line.
  const rows: VillaRow[] = villas.filter((v) => !v.parentVillaId);
  for (const s of visible) if (!rows.some((v) => v.id === houseOf(s.villaId ?? s.villa?.id))) rows.push(s.villa);
  const shownRows = onlyBooked ? rows.filter((v) => byVilla.has(v.id)) : rows;

  // Nights booked in the days on screen.
  const occupiedNights = (villaId: string) =>
    (byVilla.get(villaId) ?? []).reduce((sum, s) => {
      const a = Math.max(utcDay(new Date(s.checkIn!)), winStart);
      const b = Math.min(utcDay(new Date(s.checkOut!)), winEnd);
      return s.status === 'CANCELLED' ? sum : sum + Math.max(0, Math.round((b - a) / DAY));
    }, 0);

  const monthLabel = (() => {
    const first = MONTH.format(new Date(winStart));
    const last = MONTH.format(new Date(winEnd - DAY));
    return first === last ? first : `${first.split(' ')[0]} – ${last}`;
  })();

  const width = days.length * COL;

  // An empty period says so, and points to the nearest stays before and after it.
  const empty = !loadingStays && visible.length === 0;
  const { data: around } = useQuery({
    queryKey: ['reservations', 'around', from, to, country],
    enabled: empty,
    queryFn: async () => {
      const get = async (a: string, b: string) => {
        const params = new URLSearchParams({ from: a, to: b });
        if (country) params.set('country', country);
        const res = await apiClient.get(`/reservations?${params}`);
        const d = res.data?.data ?? res.data;
        return ((d?.data ?? d) as TimelineStay[]).filter((x) => x.status !== 'CANCELLED' && x.checkIn && x.checkOut);
      };
      const [before, after] = await Promise.all([get('2000-01-01', iso(days[0] - DAY)), get(iso(days[days.length - 1] + DAY), '2100-01-01')]);
      const last = before.sort((x, y) => +new Date(y.checkOut!) - +new Date(x.checkOut!))[0] ?? null;
      const next = after.sort((x, y) => +new Date(x.checkIn!) - +new Date(y.checkIn!))[0] ?? null;
      return { last, next };
    },
  });
  const jumpTo = (s: TimelineStay) => goTo(utcDay(new Date(s.checkIn!)) - 3 * DAY);
  const loading = loadingVillas || loadingStays;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goTo(winStart - 14 * DAY)}
            className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft hover:text-ink hover:border-line-strong"
            aria-label="Deux semaines plus tôt"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => goTo(todayUtc() - 3 * DAY)}
            className="h-9 px-4 rounded-full border border-line bg-surface text-[13px] font-semibold text-ink hover:border-line-strong"
          >
            Aujourd’hui
          </button>
          <button
            type="button"
            onClick={() => goTo(winStart + 14 * DAY)}
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
          <label className="inline-flex items-center gap-1.5 cursor-pointer" title="Demandes et devis Lodgify : pas encore des réservations">
            <input type="checkbox" checked={showEnquiries} onChange={(e) => setShowEnquiries(e.target.checked)} />
            Demandes{enquiries ? ` (${enquiries})` : ''}
          </label>
        </div>
      </div>

      {empty && (
        <div className="rounded-2xl bg-surface-2/60 px-4 py-3 text-[13px] text-ink-soft flex flex-wrap items-center gap-x-4 gap-y-2">
          <span>
            Aucun séjour du {formatDay(iso(days[0]))} au {formatDay(iso(days[days.length - 1]))}.
          </span>
          {around?.last && (
            <button type="button" onClick={() => jumpTo(around.last!)} className="font-semibold text-accent hover:underline">
              ← Dernier : {guestName(around.last)}, {formatDay(around.last.checkIn)} → {formatDay(around.last.checkOut)}
            </button>
          )}
          {around?.next && (
            <button type="button" onClick={() => jumpTo(around.next!)} className="font-semibold text-accent hover:underline">
              Prochain : {guestName(around.next)}, {formatDay(around.next.checkIn)} →
            </button>
          )}
          {around && !around.last && !around.next && <span>Aucun séjour daté dans l’appli.</span>}
        </div>
      )}

      {live?.configured && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          {live.stats ? (
            <span>
              Lodgify : <b className="text-ink-soft">{live.stats.read}</b> réservation(s) lue(s), dont {live.stats.external} via Airbnb, Booking.com… ·{' '}
              {live.stats.inPeriod} sur cette période · lu à {new Date(live.stats.readAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span>Lodgify : lecture en cours…</span>
          )}
          <button
            type="button"
            disabled={refreshing || liveLoading}
            onClick={async () => {
              setRefreshing(true);
              try {
                const res = await apiClient.get(`/lodgify/calendar?from=${from}&to=${to}&refresh=true`, { timeout: 60_000 });
                qc.setQueryData(['reservations', 'lodgify-live', from, to], res.data?.data ?? res.data);
                qc.invalidateQueries({ queryKey: ['reservations'] });
              } finally {
                setRefreshing(false);
              }
            }}
            className="font-semibold text-accent hover:underline disabled:opacity-50"
          >
            {refreshing ? 'Lecture de Lodgify…' : 'Actualiser'}
          </button>
          <button type="button" onClick={() => setFinding(true)} className="font-semibold text-accent hover:underline">
            Une réservation manque ?
          </button>
        </p>
      )}

      {!!live?.unknownProperties?.length && (
        <MissingListings
          listings={live.unknownProperties}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ['villas'] });
            qc.invalidateQueries({ queryKey: ['reservations'] });
          }}
        />
      )}

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
        <div
          ref={scroller}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // Swiping sideways scrolls the calendar, never the browser back a page.
          className="overflow-x-auto overscroll-x-contain cursor-grab active:cursor-grabbing select-none"
        >
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
                      className="sticky left-0 z-10 bg-surface shrink-0 px-3 py-2 flex items-center gap-2.5 border-r border-line group-hover/row:bg-surface-2"
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
                        const formula = formulaOf(s);
                        const name = guestName(s) + (formula ? ` · ${formula}` : '');
                        const n = nights(s);
                        const past = b < today;
                        const w = Math.max(right - left, 18);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelected(s)}
                            title={`${name} · ${formatDay(s.checkIn)} → ${formatDay(s.checkOut)}${s.logifyId || s.live ? ` · Lodgify${s.channel ? ` (${s.channel})` : ''}` : s.source?.startsWith('extras') ? ' · suivi des extras' : ' · direct'}`}
                            style={{ left, width: w, top: 7 + lane * ROW, height: ROW - 6 }}
                            className={cn(
                              'absolute flex items-center gap-1.5 pl-1 pr-2.5 text-left text-[12px] font-semibold shadow-sm transition-transform hover:-translate-y-px hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                              STATUS[s.status]?.bar ?? STATUS.CONFIRMED.bar,
                              cutLeft ? 'rounded-l-md' : 'rounded-l-full',
                              cutRight ? 'rounded-r-md' : 'rounded-r-full',
                              past && 'opacity-55',
                              s.enquiry && '!bg-surface !text-ink-soft border border-dashed border-line-strong',
                            )}
                          >
                            {/* The name stays in sight while the bar is half scrolled away */}
                            <span className="sticky flex items-center gap-1.5 min-w-0" style={{ left: NAME_COL + 4 }}>
                              {w > 60 && (
                                <span className="w-[22px] h-[22px] rounded-full bg-surface text-ink text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {initials(name)}
                                </span>
                              )}
                              {w > 90 && <span className="truncate">{name}</span>}
                            </span>
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

      <FindBooking open={finding} onClose={() => setFinding(false)} onJump={(d) => goTo(utcDay(new Date(d)) - 3 * DAY)} />

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
  const origin = s?.enquiry
    ? 'Demande / devis Lodgify : pas encore une réservation'
    : s?.live
    ? `Lodgify${s.channel ? ` · ${s.channel}` : ''}, lu en direct`
    : fromLodgify
      ? `Lodgify${s?.channel ? ` · ${s.channel}` : ''}`
      : s?.source?.startsWith('extras')
        ? 'Séjour du suivi des extras'
        : 'Réservation directe (saisie dans l’appli)';
  // The guest's stay space, beside the stay (a centred window, easier to read than a side panel).
  const invite = !!s && !s.live && !s.enquiry && s.status !== 'CANCELLED';
  return (
    <Modal open={!!s} onClose={onClose} title={s ? guestName(s) : ''} description={s?.villa?.name} size={invite ? '2xl' : 'lg'}>
      {s && (
        <div className={cn('grid gap-6', invite && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]')}>
        <div className="space-y-5">
          {/* The villa, as on Airbnb */}
          {s.villa?.coverImage && (
            <div className="relative aspect-[16/9] rounded-2xl overflow-hidden bg-surface-2">
              <img src={s.villa.coverImage} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS[s.status]?.badge ?? 'confirmed'}>{STATUS[s.status]?.label ?? s.status}</Badge>
            <span className="text-[12px] text-muted">{origin}</span>
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
                <Users size={15} className="text-muted" /> {s.guests} personne{s.guests > 1 ? 's' : ''}
              </li>
            )}
            <li className="flex items-center gap-2.5">
              <CalendarDays size={15} className="text-muted" />
              {s.totalAmount > 0 ? (
                <span>
                  Montant du séjour : <b className="text-ink">{formatCurrency(s.totalAmount, currency)}</b>{' '}
                  <MadEquivalent amount={s.totalAmount} currency={currency} />
                </span>
              ) : (
                'Montant du séjour non renseigné'
              )}
            </li>
            {!s.live && (
              <li className="flex items-center gap-2.5">
                <ShoppingBag size={15} className="text-muted" />
                {s._count?.orders ?? 0} extra{(s._count?.orders ?? 0) > 1 ? 's' : ''}
                <Link to={`/extras/saisie?stayId=${s.id}&stays=all`} className="ml-auto text-accent font-semibold hover:underline">
                  Voir
                </Link>
              </li>
            )}
          </ul>

          {(s.client?.phone || realEmail(s.client?.email)) && (
            <div className="rounded-2xl border border-line p-3.5 text-[13px]">
              <p className="text-[11.5px] text-muted mb-1">Contact</p>
              {s.client.phone && <p className="text-ink">{s.client.phone}</p>}
              {realEmail(s.client.email) && <p className="text-ink-soft">{s.client.email}</p>}
            </div>
          )}

          {s.notes && <p className="text-[13px] text-ink-soft whitespace-pre-line">{s.notes}</p>}

          {s.live && (
            <p className="text-[12px] text-muted">
              Lue directement dans Lodgify (rien n’y est modifié). Elle sera copiée dans l’appli à la prochaine synchronisation, pour y
              rattacher des extras.
            </p>
          )}

          {onEdit && !s.live && (
            <Button variant="secondary" icon={<Pencil size={13} />} onClick={() => onEdit(s)} className="w-full">
              Modifier la réservation
            </Button>
          )}
        </div>
        {/* Invite the guest to their stay space (booklet + the villa's services). */}
        {invite && (
          <div>
            <StayInvitePanel stayId={s.id} />
          </div>
        )}
        </div>
      )}
    </Modal>
  );
}

/* ───────────────────── Lodgify listings not in the app ───────────────────── */

/** Bookings on listings the app does not have are not shown: name them, and add the ones wanted. */
function MissingListings({ listings, onAdded }: { listings: { id: string; name: string; bookings: number }[]; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const total = listings.reduce((s, l) => s + l.bookings, 0);
  const sorted = [...listings].sort((a, b) => b.bookings - a.bookings || a.name.localeCompare(b.name));
  const add = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post('/lodgify/properties/import', { ids: [...chosen] }, { timeout: 60_000 });
      const d = res.data?.data ?? res.data;
      toast.success(`${d.created} logement(s) ajouté(s)${d.updated ? `, ${d.updated} mis à jour` : ''} depuis Lodgify`);
      if (d.errors?.length) toast.error(d.errors.slice(0, 3).join(' · '), { duration: 8000 });
      setOpen(false);
      onAdded();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Ajout impossible');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border border-warning/30 bg-warning/5 px-4 py-3 text-[13px] text-ink-soft flex flex-wrap items-center gap-x-3 gap-y-2">
      <span>
        <b className="text-warning">{total} réservation(s) Lodgify non affichée(s)</b> : {listings.length} annonce(s) ne sont pas dans l’appli (
        {sorted.slice(0, 3).map((l) => l.name).join(', ')}
        {listings.length > 3 ? '…' : ''}).
      </span>
      <button
        type="button"
        onClick={() => {
          setChosen(new Set(listings.map((l) => l.id)));
          setOpen(true);
        }}
        className="font-semibold text-accent hover:underline"
      >
        Choisir les annonces à ajouter
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Annonces Lodgify absentes de l’appli"
        description="Cochez les logements que vous gérez : ils sont ajoutés aux villas et leurs réservations s’affichent. Rien n’est modifié dans Lodgify."
        size="lg"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <button
              type="button"
              className="text-[12.5px] font-semibold text-muted hover:text-ink"
              onClick={() => setChosen(chosen.size === listings.length ? new Set() : new Set(listings.map((l) => l.id)))}
            >
              {chosen.size === listings.length ? 'Tout décocher' : 'Tout cocher'}
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button loading={busy} disabled={!chosen.size} onClick={add}>
                Ajouter {chosen.size} logement{chosen.size > 1 ? 's' : ''}
              </Button>
            </div>
          </div>
        }
      >
        <div className="max-h-[50vh] overflow-y-auto divide-y divide-line rounded-xl border border-line">
          {sorted.map((l) => (
            <label key={l.id} className="flex items-center gap-3 px-3 py-2.5 text-[13px] cursor-pointer hover:bg-surface-2/50">
              <input
                type="checkbox"
                checked={chosen.has(l.id)}
                onChange={() =>
                  setChosen((prev) => {
                    const next = new Set(prev);
                    if (next.has(l.id)) next.delete(l.id);
                    else next.add(l.id);
                    return next;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
              <span className="text-[12px] text-muted shrink-0">{l.bookings} réservation{l.bookings > 1 ? 's' : ''}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
