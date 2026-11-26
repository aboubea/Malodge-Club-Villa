import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronLeft, ChevronRight, LogIn, LogOut, Plus, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../lib/utils';
import { activityKind, chipLabel, EVENT_ICON, MAINTENANCE_ICON, STAY_ICON } from './agendaIcons';

const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const DAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY = 86_400_000;

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  type: string;
  villa?: { id: string; name: string; city?: string };
  reservationId?: string;
  orderId?: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
  };
  source: string;
  // Stays
  guest?: string;
  status?: string;
  guests?: number | null;
  lodgify?: boolean;
  extras?: number;
  house?: string | null;
  formula?: string | null;
  // Activities
  category?: string | null;
  quantity?: number | null;
  provider?: string | null;
}

interface NewEventForm {
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  type: string;
  allDay: boolean;
  color: string;
}

const DEFAULT_FORM: NewEventForm = {
  title: '',
  description: '',
  startAt: '',
  endAt: '',
  type: 'activity',
  allDay: false,
  color: '#22c55e',
};

const STAY_TONE: Record<string, string> = {
  CONFIRMED: 'bg-primary text-on-primary',
  PENDING: 'bg-peach text-ink ring-1 ring-inset ring-accent/40',
  ACTIVE: 'bg-success text-white',
  COMPLETED: 'bg-surface-2 text-ink-soft ring-1 ring-inset ring-line-strong',
};
const ORDER_STATUS: Record<string, string> = {
  PENDING: 'À confirmer',
  CONFIRMED: 'Confirmée',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Réalisée',
  CANCELLED: 'Annulée',
};

const pad = (n: number) => String(n).padStart(2, '0');
const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Stays are calendar days (stored 00:00 UTC); timed events are read in local time. */
const dayKeyOf = (iso: string, allDay: boolean) => (allDay ? iso.slice(0, 10) : localKey(new Date(iso)));
const keyToUtc = (k: string) => Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
/** Imported activities carry a date only (00:00 UTC): no time is shown for them. */
const timeOf = (iso: string) => {
  const d = new Date(iso);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};
const shortName = (s: string) => s.replace(/\s+[-–—]\s+.*$/, '').trim();
const nightsOf = (s: CalendarEvent) => Math.round((keyToUtc(dayKeyOf(s.endAt, true)) - keyToUtc(dayKeyOf(s.startAt, true))) / DAY);

function iconFor(e: CalendarEvent) {
  if (e.type === 'maintenance')
    return {
      icon: MAINTENANCE_ICON,
      tone: 'bg-copper/10 text-copper border-copper/25',
      label: 'Maintenance',
    };
  if (e.type === 'event')
    return {
      icon: EVENT_ICON,
      tone: 'bg-success/10 text-success border-success/25',
      label: 'Événement',
    };
  const k = activityKind(e.title, e.category);
  return { icon: k.icon, tone: k.tone, label: k.label };
}

export function CalendarPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isStaff = !!user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedKey, setSelectedKey] = useState(localKey(new Date()));
  const [typeFilter, setTypeFilter] = useState('all');
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [form, setForm] = useState<NewEventForm>(DEFAULT_FORM);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Weeks shown (Monday first), with the days of the neighbouring months that complete them.
  const weeks = useMemo(() => {
    const lead = (new Date(year, month, 1).getDay() + 6) % 7;
    const count = Math.ceil((lead + new Date(year, month + 1, 0).getDate()) / 7);
    return Array.from({ length: count }, (_, w) => Array.from({ length: 7 }, (_, i) => new Date(year, month, 1 - lead + w * 7 + i)));
  }, [year, month]);

  const from = new Date(weeks[0][0].getFullYear(), weeks[0][0].getMonth(), weeks[0][0].getDate()).toISOString();
  const lastDay = weeks[weeks.length - 1][6];
  const to = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59).toISOString();

  const { data, isLoading } = useQuery<{ data: CalendarEvent[] }>({
    queryKey: ['calendar', from, to, typeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await apiClient.get(`/calendar?${params}`);
      return res.data.data ?? res.data;
    },
    placeholderData: (prev) => prev,
  });
  const events: CalendarEvent[] = data?.data ?? [];

  const stays = useMemo(() => events.filter((e) => e.type === 'reservation' && e.status !== 'CANCELLED'), [events]);
  const others = useMemo(() => events.filter((e) => e.type !== 'reservation'), [events]);
  const othersByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of others) {
      const k = dayKeyOf(e.startAt, e.allDay);
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    for (const list of map.values()) list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    return map;
  }, [others]);

  const createMutation = useMutation({
    mutationFn: (payload: NewEventForm) => apiClient.post('/calendar', payload),
    onSuccess: () => {
      toast.success('Événement créé');
      qc.invalidateQueries({ queryKey: ['calendar'] });
      setNewEventOpen(false);
      setForm(DEFAULT_FORM);
    },
    onError: () => toast.error('Erreur lors de la création'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/calendar/${id}`),
    onSuccess: () => {
      toast.success('Événement supprimé');
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  function openNewEvent(dayKey?: string) {
    const base = dayKey ? new Date(`${dayKey}T09:00:00`) : new Date();
    const toLocal = (dt: Date) => `${localKey(dt)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    setForm({
      ...DEFAULT_FORM,
      startAt: toLocal(base),
      endAt: toLocal(new Date(base.getTime() + 3600_000)),
    });
    setNewEventOpen(true);
  }

  // The selected day at a glance.
  const day = useMemo(() => {
    const k = selectedKey;
    const t = keyToUtc(k);
    const arrivals = stays.filter((s) => dayKeyOf(s.startAt, true) === k);
    const departures = stays.filter((s) => dayKeyOf(s.endAt, true) === k && nightsOf(s) > 0);
    const staying = stays.filter((s) => keyToUtc(dayKeyOf(s.startAt, true)) < t && keyToUtc(dayKeyOf(s.endAt, true)) > t);
    const activities = othersByDay.get(k) ?? [];
    return { arrivals, departures, staying, activities };
  }, [selectedKey, stays, othersByDay]);

  const todayKey = localKey(new Date());
  const selectedDate = new Date(`${selectedKey}T12:00:00`);
  const kindsThisMonth = useMemo(() => {
    const seen = new Map<string, ReturnType<typeof iconFor>>();
    for (const e of others) {
      const k = iconFor(e);
      if (!seen.has(k.label)) seen.set(k.label, k);
    }
    return [...seen.values()];
  }, [others]);

  const TYPE_OPTIONS = [
    { value: 'all', label: 'Tous' },
    { value: 'reservation', label: 'Séjours' },
    { value: 'order', label: 'Activités & extras' },
    { value: 'event', label: 'Événements' },
    { value: 'maintenance', label: 'Maintenance' },
  ];

  return (
    <div className="space-y-5 max-w-[1500px]">
      <PageHeader title="Agenda" description="Séjours et activités de vos villas, jour par jour">
        {isStaff && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => openNewEvent(selectedKey)}>
            Nouvel événement
          </Button>
        )}
      </PageHeader>

      {/* The selected day at a glance */}
      <div>
        <p className="text-[12.5px] font-semibold text-ink-soft mb-2">
          {selectedKey === todayKey ? 'Aujourd’hui,' : 'Le'}{' '}
          {selectedDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              label: 'Arrivées',
              icon: LogIn,
              n: day.arrivals.length,
              tone: 'text-success',
            },
            {
              label: 'Départs',
              icon: LogOut,
              n: day.departures.length,
              tone: 'text-accent',
            },
            {
              label: 'En séjour',
              icon: STAY_ICON,
              n: day.staying.length,
              tone: 'text-ink',
            },
            {
              label: 'Activités',
              icon: activityKind('excursion').icon,
              n: day.activities.length,
              tone: 'text-plum',
            },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl border border-line bg-surface px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-surface-2 flex items-center justify-center shrink-0">
                <c.icon size={17} className={c.tone} />
              </span>
              <div>
                <p className="text-[12px] text-muted">{c.label}</p>
                <p className="text-[20px] font-bold text-ink leading-tight tabular">{c.n}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            className={cn(
              'inline-flex items-center h-9 px-4 rounded-full text-[13.5px] font-semibold border transition-colors',
              typeFilter === opt.value ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink hover:border-ink/50',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* Month */}
        <div className="rounded-2xl border border-line bg-surface overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <button
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
              aria-label="Mois précédent"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-bold text-ink">
                {MONTHS_FR[month]} {year}
              </h2>
              <button
                onClick={() => {
                  setCurrentDate(new Date());
                  setSelectedKey(todayKey);
                }}
                className="h-7 px-3 rounded-full border border-line text-[12px] font-semibold text-ink-soft hover:text-ink"
              >
                Aujourd’hui
              </button>
            </div>
            <button
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2"
              aria-label="Mois suivant"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-7 border-b border-line">
                {DAYS_FR.map((d) => (
                  <div key={d} className="px-2 py-2 text-center text-[11px] font-semibold text-muted uppercase tracking-wide">
                    {d}
                  </div>
                ))}
              </div>

              {isLoading && !events.length ? (
                <div className="py-20 text-center">
                  <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
                </div>
              ) : (
                weeks.map((week) => {
                  const ws = keyToUtc(localKey(week[0]));
                  // Stays of the week as bars from arrival (afternoon) to departure (morning), on as few lines as possible.
                  const placed: {
                    s: CalendarEvent;
                    a: number;
                    b: number;
                    lane: number;
                    cutL: boolean;
                    cutR: boolean;
                  }[] = [];
                  const ends: number[] = [];
                  for (const s of [...stays].sort((x, y) => x.startAt.localeCompare(y.startAt))) {
                    let a0 = (keyToUtc(dayKeyOf(s.startAt, true)) - ws) / DAY + 0.5;
                    let b0 = (keyToUtc(dayKeyOf(s.endAt, true)) - ws) / DAY + 0.5;
                    // Arrival and departure the same day: a pill across that day.
                    if (b0 - a0 < 0.5) [a0, b0] = [a0 - 0.45, b0 + 0.45];
                    if (b0 <= 0 || a0 >= 7) continue;
                    const a = Math.max(a0, 0);
                    const b = Math.min(b0, 7);
                    let lane = ends.findIndex((e) => e <= a);
                    if (lane === -1) lane = ends.push(0) - 1;
                    ends[lane] = b;
                    placed.push({ s, a, b, lane, cutL: a0 < 0, cutR: b0 > 7 });
                  }
                  const lanes = ends.length;
                  const top = 30 + lanes * 26;
                  return (
                    <div key={ws} className="relative grid grid-cols-7 border-b border-line last:border-b-0">
                      {week.map((d) => {
                        const k = localKey(d);
                        const inMonth = d.getMonth() === month;
                        const list = othersByDay.get(k) ?? [];
                        const selected = k === selectedKey;
                        return (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setSelectedKey(k)}
                            style={{ paddingTop: top }}
                            className={cn(
                              'relative text-left min-h-[124px] border-r border-line last:border-r-0 px-1.5 pb-1.5 transition-colors',
                              !inMonth && 'bg-surface-2/40',
                              selected ? 'bg-accent/[0.06]' : 'hover:bg-surface-2/50',
                            )}
                          >
                            <span
                              className={cn(
                                'absolute top-1.5 left-1.5 w-7 h-7 rounded-full flex items-center justify-center text-[12.5px] font-semibold tabular',
                                k === todayKey ? 'bg-accent text-on-accent' : selected ? 'bg-primary text-on-primary' : inMonth ? 'text-ink' : 'text-muted',
                              )}
                            >
                              {d.getDate()}
                            </span>
                            <span className="space-y-1 block">
                              {list.slice(0, 3).map((e) => {
                                const k2 = iconFor(e);
                                const time = timeOf(e.startAt);
                                return (
                                  <span
                                    key={e.id}
                                    className={cn('flex items-center gap-1 h-[22px] px-1.5 rounded-md border text-[11px] font-medium', k2.tone)}
                                    title={`${e.title}${e.guest ? ` · ${e.guest}` : ''}`}
                                  >
                                    <k2.icon size={12} className="shrink-0" />
                                    {time && <span className="tabular shrink-0">{time}</span>}
                                    <span className="truncate">{e.type === 'order' ? chipLabel(e.title) : e.title}</span>
                                  </span>
                                );
                              })}
                              {list.length > 3 && <span className="block px-1 text-[11px] font-semibold text-muted">+ {list.length - 3} autre(s)</span>}
                            </span>
                          </button>
                        );
                      })}
                      {/* Stay bars, over the day cells */}
                      {placed.map(({ s, a, b, lane, cutL, cutR }) => (
                        <button
                          key={`${s.id}-${ws}`}
                          type="button"
                          onClick={() => setSelectedKey(dayKeyOf(s.startAt, true))}
                          title={`${s.guest ?? s.title} · ${s.house ?? s.villa?.name ?? ''}`}
                          style={{
                            left: `calc(${(a / 7) * 100}% + 2px)`,
                            width: `calc(${((b - a) / 7) * 100}% - 4px)`,
                            top: 32 + lane * 26,
                          }}
                          className={cn(
                            'absolute h-[22px] flex items-center gap-1 px-2 text-[11px] font-semibold shadow-sm',
                            STAY_TONE[s.status ?? 'CONFIRMED'] ?? STAY_TONE.CONFIRMED,
                            cutL ? 'rounded-l-sm' : 'rounded-l-full',
                            cutR ? 'rounded-r-sm' : 'rounded-r-full',
                          )}
                        >
                          <STAY_ICON size={12} className="shrink-0 opacity-80" />
                          <span className="truncate">
                            {s.guest ?? s.title}
                            <span className="font-normal opacity-75"> · {shortName(s.house ?? s.villa?.name ?? '')}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 border-t border-line text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-6 h-3 rounded-full bg-primary" /> Séjour confirmé
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-6 h-3 rounded-full bg-peach ring-1 ring-inset ring-accent/40" /> En attente
            </span>
            {kindsThisMonth.map((k) => (
              <span key={k.label} className="inline-flex items-center gap-1">
                <k.icon size={13} /> {k.label}
              </span>
            ))}
          </div>
        </div>

        {/* Day detail */}
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-4 xl:sticky xl:top-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[16px] font-bold text-ink first-letter:uppercase">
                {selectedDate.toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </p>
              <p className="text-[12px] text-muted">
                {day.arrivals.length + day.departures.length + day.staying.length + day.activities.length === 0 ? 'Rien de prévu' : 'Programme du jour'}
              </p>
            </div>
            {isStaff && (
              <Button variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => openNewEvent(selectedKey)}>
                Ajouter
              </Button>
            )}
          </div>

          <StaySection title="Arrivées" icon={LogIn} tone="text-success" list={day.arrivals} />
          <StaySection title="Départs" icon={LogOut} tone="text-accent" list={day.departures} />

          {day.activities.length > 0 && (
            <section>
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Activités ({day.activities.length})</p>
              <div className="space-y-2">
                {day.activities.map((e) => {
                  const k = iconFor(e);
                  const time = timeOf(e.startAt);
                  return (
                    <div key={e.id} className="flex gap-3 rounded-xl border border-line p-3">
                      <span className={cn('w-9 h-9 rounded-xl border flex items-center justify-center shrink-0', k.tone)}>
                        <k.icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-ink leading-snug">
                          {e.title}
                          {e.quantity && e.quantity > 1 ? <span className="text-muted font-normal"> × {e.quantity}</span> : null}
                        </p>
                        <p className="text-[12px] text-ink-soft mt-0.5">{[time, e.guest, e.house && shortName(e.house)].filter(Boolean).join(' · ') || k.label}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[11.5px]">
                          {e.status && <span className="h-5 px-2 inline-flex items-center rounded-full bg-surface-2 text-ink-soft">{ORDER_STATUS[e.status] ?? e.status}</span>}
                          {e.provider && <span className="text-muted">par {e.provider}</span>}
                          {e.orderId && (
                            <Link to={`/commandes/${e.orderId}`} className="ml-auto inline-flex items-center gap-0.5 font-semibold text-accent hover:underline">
                              Détail <ArrowRight size={12} />
                            </Link>
                          )}
                          {isStaff && e.source === 'custom' && (
                            <button onClick={() => deleteMutation.mutate(e.id)} className="ml-auto text-muted hover:text-danger" aria-label="Supprimer">
                              <X size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <StaySection title="En séjour" icon={STAY_ICON} tone="text-ink" list={day.staying} compact />
        </div>
      </div>

      {isStaff && (
        <Modal
          open={newEventOpen}
          onClose={() => {
            setNewEventOpen(false);
            setForm(DEFAULT_FORM);
          }}
          title="Nouvel événement"
          size="lg"
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.title || !form.startAt || !form.endAt) return;
              createMutation.mutate(form);
            }}
          >
            <Input label="Titre" placeholder="Maintenance piscine, activité yoga…" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              {(['startAt', 'endAt'] as const).map((f) => (
                <div key={f}>
                  <label className="text-[12.5px] font-medium text-ink-soft">{f === 'startAt' ? 'Début' : 'Fin'}</label>
                  <input
                    type="datetime-local"
                    className="w-full mt-1.5 h-10 px-3 rounded-xl bg-surface border border-line text-ink text-sm focus:outline-none focus:border-ink/25 focus:ring-4 focus:ring-ink/5"
                    value={form[f]}
                    onChange={(e) => setForm((p) => ({ ...p, [f]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="text-[12.5px] font-medium text-ink-soft">Type</label>
              <select
                className="w-full mt-1.5 h-10 px-3 rounded-xl bg-surface border border-line text-ink text-sm focus:outline-none focus:border-ink/25 focus:ring-4 focus:ring-ink/5"
                value={form.type}
                onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
              >
                <option value="activity">Activité</option>
                <option value="event">Événement</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
            <Input label="Description (optionnel)" placeholder="Détails…" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm((p) => ({ ...p, allDay: e.target.checked }))}
                className="w-4 h-4 rounded border border-line bg-surface accent-accent"
              />
              <span className="text-sm text-ink">Toute la journée</span>
            </label>
            <Button type="submit" variant="primary" loading={createMutation.isPending} className="w-full" disabled={!form.title || !form.startAt || !form.endAt}>
              Créer l’événement
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function StaySection({ title, icon: Icon, tone, list, compact }: { title: string; icon: React.ElementType; tone: string; list: CalendarEvent[]; compact?: boolean }) {
  if (!list.length) return null;
  return (
    <section>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2 flex items-center gap-1.5">
        <Icon size={13} className={tone} /> {title} ({list.length})
      </p>
      <div className={compact ? 'space-y-1' : 'space-y-2'}>
        {list.map((s) => (
          <div key={s.id} className={cn('rounded-xl border border-line', compact ? 'px-3 py-2' : 'p-3')}>
            <p className="text-[13px] font-semibold text-ink truncate">
              {s.guest ?? s.title}
              {s.lodgify && <span className="ml-1.5 text-[11px] font-semibold text-accent">Lodgify</span>}
            </p>
            <p className="text-[12px] text-ink-soft truncate">
              {shortName(s.house ?? s.villa?.name ?? '')}
              {s.formula ? ` · ${shortName(s.formula)}` : ''} · {nightsOf(s) ? `${nightsOf(s)} nuit${nightsOf(s) > 1 ? 's' : ''}` : 'arrivée et départ le même jour'}
              {s.guests ? (
                <>
                  {' · '}
                  <Users size={11} className="inline -mt-0.5" /> {s.guests}
                </>
              ) : null}
              {s.extras ? ` · ${s.extras} extra${s.extras > 1 ? 's' : ''}` : ''}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
