import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FileText,
  Hourglass,
  Inbox,
  KeyRound,
  LogIn,
  LogOut,
  Moon,
  Percent,
  Send,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { apiClient } from '../../lib/apiClient';
import { cn, formatCurrency } from '../../lib/utils';
import { Skeleton } from '../../components/ui/Skeleton';
import { useAuthStore } from '../../store/authStore';
import { useExtrasSummary } from '../extras/api';
import { useDashboard } from './useDashboard';

interface StayCard {
  id: string;
  guest: string;
  villa: { id: string; name: string; photo: string | null };
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  guests: number | null;
  invited: boolean;
}
interface Today {
  date: string;
  arrivals: StayCard[];
  departures: StayCard[];
  inHouse: StayCard[];
  upcoming: StayCard[];
  todo: { pendingRequests: number; overdueExtras: number; toInvite: number; draftStatements: number; statementsMonth: string };
}

const ease = [0.22, 1, 0.36, 1] as const;
const rise = (i: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.04 * i, duration: 0.35, ease } });
const shortDay = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

/** One guest, Airbnb style: the villa's photo, who, where, when. Opens the stay. */
function GuestCard({ s, kind }: { s: StayCard; kind: 'arrival' | 'departure' | 'inHouse' | 'upcoming' }) {
  return (
    <Link to={`/reservations?stay=${s.id}`} className="group block w-[230px] sm:w-[250px] shrink-0 snap-start">
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-surface-2">
        {s.villa.photo ? (
          <img src={s.villa.photo} alt="" loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-line-strong">
            <Building2 size={34} />
          </div>
        )}
        {(kind === 'arrival' || kind === 'upcoming') && (
          <span
            className={cn(
              'absolute top-2.5 left-2.5 h-7 px-2.5 rounded-full text-[12px] font-semibold inline-flex items-center gap-1 shadow-card',
              s.invited ? 'bg-surface/95 text-ink' : 'bg-primary text-on-primary',
            )}
          >
            {s.invited ? <CheckCircle2 size={13} className="text-success" /> : <Send size={12} />}
            {s.invited ? 'Invité' : 'À inviter'}
          </span>
        )}
      </div>
      <div className="mt-2.5 px-0.5">
        <p className="text-[15px] font-semibold text-ink truncate">{s.guest}</p>
        <p className="text-[13px] text-muted truncate">{s.villa.name}</p>
        <p className="text-[13px] text-ink-soft mt-0.5">
          {kind === 'departure' ? `Départ · arrivé ${shortDay(s.checkIn)}` : kind === 'inHouse' ? `Jusqu’au ${shortDay(s.checkOut)}` : shortDay(s.checkIn)}
          {s.nights ? ` · ${plural(s.nights, 'nuit')}` : ''}
          {s.guests ? ` · ${s.guests} pers.` : ''}
        </p>
      </div>
    </Link>
  );
}

/** A thing waiting to be done, with how many and where to go. */
function TodoRow({ icon: Icon, label, hint, count, to, tone = 'accent' }: { icon: React.ElementType; label: string; hint: string; count: number; to: string; tone?: 'accent' | 'warning' }) {
  return (
    <Link to={to} className="flex items-center gap-3.5 px-4 sm:px-5 py-3 hover:bg-surface-2/70 active:bg-surface-2 transition-colors">
      <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-peach text-accent')}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{label}</span>
        <span className="block text-[13px] text-muted truncate">{hint}</span>
      </span>
      <span className="min-w-[28px] h-7 px-2 rounded-full bg-surface-2 text-[13px] font-bold text-ink inline-flex items-center justify-center tabular">{count}</span>
      <ChevronRight size={18} className="text-line-strong shrink-0" />
    </Link>
  );
}

/** A figure, Apple widget style. */
function Widget({ icon: Icon, label, value, sub, to, delay }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: React.ReactNode; to?: string; delay: number }) {
  const body = (
    <motion.div {...rise(delay)} className="h-full rounded-2xl bg-surface border border-line/80 p-4 sm:p-5 hover:shadow-lift transition-shadow">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted">
        <Icon size={15} /> {label}
      </p>
      <p className="mt-2 font-display text-[26px] sm:text-[30px] leading-none font-bold tracking-[-0.03em] text-ink tabular">{value}</p>
      {sub && <p className="mt-2 text-[12.5px] text-ink-soft">{sub}</p>}
    </motion.div>
  );
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

type Tab = 'arrivals' | 'departures' | 'inHouse' | 'upcoming';
const TABS: { key: Tab; label: string; icon: React.ElementType; kind: 'arrival' | 'departure' | 'inHouse' | 'upcoming'; empty: string }[] = [
  { key: 'arrivals', label: 'Arrivées', icon: LogIn, kind: 'arrival', empty: 'Aucune arrivée aujourd’hui.' },
  { key: 'departures', label: 'Départs', icon: LogOut, kind: 'departure', empty: 'Aucun départ aujourd’hui.' },
  { key: 'inHouse', label: 'En cours', icon: KeyRound, kind: 'inHouse', empty: 'Aucun séjour en cours.' },
  { key: 'upcoming', label: 'Cette semaine', icon: BedDouble, kind: 'upcoming', empty: 'Aucune arrivée dans les 7 jours.' },
];

/** Home, like Airbnb's host "Today": what to do first, today's guests, then the figures. */
export function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data: dash, isLoading: loadingKpis } = useDashboard();
  const { data: summary } = useExtrasSummary();
  const { data: today, isLoading } = useQuery({
    queryKey: ['dashboard', 'today'],
    queryFn: async () => {
      const r = await apiClient.get('/dashboard/today');
      return (r.data?.data ?? r.data) as Today;
    },
    refetchInterval: 60_000,
  });
  const [tab, setTab] = useState<Tab | null>(null);

  const hour = new Date().getHours();
  const hello = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';
  const dateLine = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const k = dash?.kpis;
  const a = summary?.alerts;

  // What is waiting, most urgent first (only what is not zero).
  const todo = [
    today && today.todo.pendingRequests > 0 && { icon: Inbox, label: 'Demandes de voyageurs', hint: 'Extras demandés, à confirmer', count: today.todo.pendingRequests, to: '/commandes' },
    today && today.todo.toInvite > 0 && { icon: Send, label: 'Voyageurs à inviter', hint: 'Arrivent dans les 7 jours, sans leur lien séjour', count: today.todo.toInvite, to: '/accueil' },
    today && today.todo.overdueExtras > 0 && { icon: Hourglass, label: 'Extras passés à clôturer', hint: 'Pas encore « Réalisée » : hors chiffre d’affaires', count: today.todo.overdueExtras, to: '/extras/saisie?stays=all', tone: 'warning' as const },
    a && a.pendingSettlements > 0 && { icon: Wallet, label: 'Règlements à valider', hint: 'Saisis, en attente de validation', count: a.pendingSettlements, to: '/extras/reglements?status=PENDING' },
    a && a.incompleteExtras > 0 && { icon: CircleAlert, label: 'Extras à compléter', hint: 'Prix, coût, date ou séjour manquant', count: a.incompleteExtras, to: '/extras/saisie?incomplete=true', tone: 'warning' as const },
    a && a.settingsToCheck > 0 && { icon: Percent, label: 'Taux de commission à renseigner', hint: 'Propriétaires ou salariés sans taux', count: a.settingsToCheck, to: '/extras/reglages?section=commissions' },
    today && today.todo.draftStatements > 0 && { icon: FileText, label: 'Relevés propriétaires à envoyer', hint: 'Brouillons du mois écoulé', count: today.todo.draftStatements, to: '/releves' },
  ].filter(Boolean) as { icon: React.ElementType; label: string; hint: string; count: number; to: string; tone?: 'accent' | 'warning' }[];

  // Open on the first tab that has someone.
  const shown: Tab = tab ?? (today ? (TABS.find((t) => today[t.key].length)?.key ?? 'arrivals') : 'arrivals');
  const current = TABS.find((t) => t.key === shown)!;
  const list = today?.[shown] ?? [];

  return (
    <div className="space-y-8 max-w-[1240px]">
      <motion.header {...rise(0)}>
        <h1 className="text-[30px] sm:text-[36px] font-bold leading-[1.08] tracking-[-0.035em] text-ink">
          {hello}, {user?.firstName}
        </h1>
        <p className="mt-1.5 text-[15px] text-muted first-letter:uppercase">
          {dateLine}
          {today && (
            <>
              {' · '}
              {plural(today.arrivals.length, 'arrivée')}, {plural(today.departures.length, 'départ')} aujourd’hui
            </>
          )}
        </p>
      </motion.header>

      {/* What to do first */}
      <motion.section {...rise(1)} aria-label="À faire">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] mb-3">À faire</h2>
        {isLoading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : todo.length === 0 ? (
          <div className="rounded-2xl bg-surface border border-line/80 px-5 py-6 flex items-center gap-3 text-[15px] text-ink-soft">
            <CheckCircle2 size={22} className="text-success" /> Tout est à jour. Rien n’attend.
          </div>
        ) : (
          <div className="rounded-2xl bg-surface border border-line/80 divide-y divide-line/70 overflow-hidden">
            {todo.map((t) => (
              <TodoRow key={t.label} {...t} />
            ))}
          </div>
        )}
      </motion.section>

      {/* Today's guests, Airbnb style */}
      <motion.section {...rise(2)} aria-label="Voyageurs">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Voyageurs</h2>
          <Link to="/reservations" className="text-[14px] font-semibold text-accent hover:underline">
            Calendrier
          </Link>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 -mx-1 px-1">
          {TABS.map((t) => {
            const n = today?.[t.key].length ?? 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'h-10 px-4 rounded-full text-[14px] font-semibold inline-flex items-center gap-2 whitespace-nowrap border transition-colors',
                  shown === t.key ? 'bg-ink text-surface border-ink' : 'bg-surface text-ink border-line-strong hover:border-ink/40',
                )}
              >
                {t.label}
                <span className={cn('tabular text-[13px]', shown === t.key ? 'opacity-70' : 'text-muted')}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4">
          {isLoading ? (
            <div className="flex gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="w-[250px] aspect-[4/3] rounded-2xl" />
              ))}
            </div>
          ) : list.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong px-5 py-8 text-center text-[14px] text-muted">{current.empty}</p>
          ) : (
            <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-none pb-2 -mx-1 px-1">
              {list.map((s) => (
                <GuestCard key={`${shown}-${s.id}`} s={s} kind={current.kind} />
              ))}
            </div>
          )}
        </div>
      </motion.section>

      {/* The figures */}
      <section aria-label="Chiffres">
        <h2 className="text-[20px] font-bold tracking-[-0.02em] mb-3">Ce mois-ci</h2>
        {loadingKpis || !k ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[124px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Widget
              delay={3}
              icon={TrendingUp}
              label="Chiffre d’affaires"
              to="/finances"
              value={formatCurrency(Math.round(k.totalRevenue), k.revenueCurrency ?? 'MAD')}
              sub={
                k.revenueChange !== 0 ? (
                  <span className={cn('inline-flex items-center gap-0.5 font-semibold', k.revenueChange > 0 ? 'text-success' : 'text-danger')}>
                    {k.revenueChange > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {k.revenueChange > 0 ? '+' : ''}
                    {k.revenueChange} % <span className="font-normal text-muted">vs {k.previousMonth ?? 'mois dernier'}</span>
                  </span>
                ) : (
                  'Hébergement + extras'
                )
              }
            />
            <Widget delay={4} icon={Moon} label="Occupation ce soir" value={`${k.occupancyRate} %`} sub={`${k.activeVillas} villas actives`} to="/performance" />
            <Widget delay={5} icon={KeyRound} label="Séjours en cours" value={k.activeReservations} sub="Arrivés, pas encore partis" to="/reservations" />
            <Widget delay={6} icon={Sparkles} label="Extras du mois" value={k.ordersThisMonth} sub={`${k.pendingOrders} en attente`} to="/extras/saisie" />
          </div>
        )}
      </section>
    </div>
  );
}
