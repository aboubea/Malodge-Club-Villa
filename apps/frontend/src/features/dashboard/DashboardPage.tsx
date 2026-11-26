import { Link, useNavigate } from 'react-router-dom';
import { MadEquivalent, FxNote } from '../../lib/fx';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ShoppingBag,
  Building2,
  Users,
  BrainCircuit,
  Plus,
} from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { cn, formatCurrency } from '../../lib/utils';
import { useDashboard } from './useDashboard';

const STATUS_CONFIG: Record<string, { label: string; variant: 'active' | 'confirmed' | 'pending' | 'completed' | 'cancelled' }> = {
  ACTIVE: { label: 'En cours', variant: 'active' },
  CONFIRMED: { label: 'Confirmée', variant: 'confirmed' },
  PENDING: { label: 'En attente', variant: 'pending' },
  COMPLETED: { label: 'Terminée', variant: 'completed' },
  CANCELLED: { label: 'Annulée', variant: 'cancelled' },
};

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.35, ease: [0.22, 1, 0.36, 1] },
});

function shortDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function nights(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const n = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ChangePill({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11.5px] font-semibold tabular',
        positive ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger',
      )}
    >
      {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {positive ? '+' : ''}
      {value}%
    </span>
  );
}

function StatLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-muted">{children}</p>;
}

function BigNumber({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('font-display font-semibold text-[30px] leading-none tracking-tight text-ink tabular', className)}>
      {children}
    </p>
  );
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn('h-1.5 rounded-full bg-surface-2 overflow-hidden', className)}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="h-full rounded-full bg-gold"
      />
    </div>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const navigate = useNavigate();

  
  const kpis = data?.kpis;
  const recentReservations = data?.recentReservations ?? [];
  const villaRatio = kpis && kpis.totalVillas > 0 ? (kpis.activeVillas / kpis.totalVillas) * 100 : 0;

  const glance = [
    {
      label: 'Commandes en attente',
      value: kpis?.pendingOrders ?? 0,
      icon: ShoppingBag,
      tone: 'text-warning bg-warning/10',
      to: '/commandes',
    },
    {
      label: 'Commandes ce mois',
      value: kpis?.ordersThisMonth ?? 0,
      icon: CalendarRange,
      tone: 'text-plum bg-plum/10',
      to: '/commandes',
    },
    {
      label: 'Nouveaux clients',
      value: kpis?.activeClients ?? 0,
      icon: Users,
      tone: 'text-info bg-info/10',
      to: '/reservations',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tableau de bord"
        description="Voici l'essentiel de l'activité de vos villas."
      >
        <Button variant="secondary" icon={<CalendarRange size={15} />} onClick={() => navigate('/agenda')}>
          Agenda
        </Button>
        <Button icon={<Plus size={15} />} onClick={() => navigate('/reservations')}>
          Nouvelle réservation
        </Button>
      </PageHeader>

      {/* Headline metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <motion.div {...fadeUp(0)} className="sm:col-span-2">
          <Card className="relative h-full overflow-hidden p-6 sm:p-7 bg-peach border-transparent shadow-none">
            <svg
              aria-hidden
              viewBox="0 0 300 120"
              preserveAspectRatio="none"
              className="pointer-events-none absolute right-6 top-14 w-[42%] h-20 opacity-80"
            >
              <path
                d="M0 95 C 40 90, 60 70, 95 74 S 150 98, 185 70 S 245 30, 300 22"
                fill="none"
                stroke="rgb(var(--c-gold))"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="300" cy="22" r="5" fill="rgb(var(--c-gold))" />
            </svg>
            <div className="relative flex items-start justify-between gap-4">
              <StatLabel>Chiffre d'affaires · ce mois</StatLabel>
              {kpis && kpis.revenueChange !== 0 && <ChangePill value={kpis.revenueChange} />}
            </div>
            {isLoading ? (
              <Skeleton className="relative h-14 w-56 mt-6" />
            ) : (
              <BigNumber className="relative mt-5 text-[34px] sm:text-[38px]">
                {formatCurrency(kpis?.totalRevenue ?? 0, kpis?.revenueCurrency ?? 'EUR')}
              </BigNumber>
            )}
            {kpis?.revenueConverted ? (
              <p className="relative text-[13px] text-ink-soft mt-2 tabular">
                dont{' '}
                {kpis.revenueByCurrency!
                  .filter((r) => r.currency !== 'MAD' && r.amount)
                  .map((r) => formatCurrency(r.amount, r.currency))
                  .join(' · ')}{' '}
                converti(s) au taux du jour · <FxNote className="text-muted" />
              </p>
            ) : (
              (kpis?.revenueByCurrency?.length ?? 0) > 1 && (
                <p className="relative text-[13px] font-semibold text-ink-soft mt-2 tabular">
                  {kpis!.revenueByCurrency!
                    .slice(1)
                    .map((r) => `+ ${formatCurrency(r.amount, r.currency)}`)
                    .join('  ·  ')}
                  <span className="font-normal text-muted"> (non convertis)</span>
                </p>
              )
            )}
            <p className="relative text-[13px] text-muted mt-4">
              {kpis && kpis.revenueChange !== 0
                ? `${kpis.revenueChange >= 0 ? 'En hausse' : 'En baisse'} par rapport au mois dernier`
                : 'Prestations réalisées ce mois, comptées à leur date'}
            </p>
          </Card>
        </motion.div>

        <motion.div {...fadeUp(0.05)}>
          <Card className="h-full p-6 flex flex-col">
            <div className="flex items-center justify-between">
              <StatLabel>Taux d'occupation</StatLabel>
              <CalendarDays size={17} className="text-muted" />
            </div>
            {isLoading ? (
              <Skeleton className="h-11 w-24 mt-6" />
            ) : (
              <BigNumber className="mt-5 mb-8">
                {kpis?.occupancyRate ?? 0}
                <span className="text-[28px] text-muted ml-0.5">%</span>
              </BigNumber>
            )}
            <ProgressBar value={kpis?.occupancyRate ?? 0} className="mt-auto" />
          </Card>
        </motion.div>

        <motion.div {...fadeUp(0.1)}>
          <Card className="h-full p-6 flex flex-col">
            <div className="flex items-center justify-between">
              <StatLabel>Villas actives</StatLabel>
              <Building2 size={17} className="text-muted" />
            </div>
            {isLoading ? (
              <Skeleton className="h-11 w-24 mt-6" />
            ) : (
              <BigNumber className="mt-5 mb-8">
                {kpis?.activeVillas ?? 0}
                <span className="text-[28px] text-muted"> / {kpis?.totalVillas ?? 0}</span>
              </BigNumber>
            )}
            <ProgressBar value={villaRatio} className="mt-auto" />
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent reservations */}
        <motion.div {...fadeUp(0.15)} className="xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle>Réservations récentes</CardTitle>
                <p className="text-[12.5px] text-muted mt-0.5">
                  {isLoading
                    ? 'Chargement…'
                    : `${kpis?.activeReservations ?? 0} séjour${(kpis?.activeReservations ?? 0) > 1 ? 's' : ''} en cours`}
                </p>
              </div>
              <Link
                to="/reservations"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:text-accent-hover transition-colors"
              >
                Tout voir <ArrowRight size={14} />
              </Link>
            </CardHeader>

            {isLoading ? (
              <div className="divide-y divide-line">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4">
                    <Skeleton className="w-9 h-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentReservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-3">
                  <CalendarDays size={20} className="text-muted" />
                </div>
                <p className="text-sm text-ink-soft">Aucune réservation récente</p>
                <p className="text-[12.5px] text-muted mt-1">Les nouveaux séjours apparaîtront ici.</p>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {recentReservations.map((res) => {
                  const statusConf = STATUS_CONFIG[res.status] ?? { label: res.status, variant: 'completed' as const };
                  const n = nights(res.checkIn, res.checkOut);
                  return (
                    <li key={res.id}>
                      <Link
                        to="/reservations"
                        className="flex items-center gap-4 px-5 sm:px-6 py-3.5 hover:bg-surface-2/50 transition-colors"
                      >
                        <Avatar
                          firstName={res.client.firstName}
                          lastName={res.client.lastName}
                          src={res.client.avatar}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">
                            {res.client.firstName} {res.client.lastName}
                          </p>
                          <p className="text-[12.5px] text-muted truncate">{res.villa.name}</p>
                        </div>
                        <div className="hidden md:block text-right shrink-0">
                          <p className="text-[13px] text-ink-soft tabular">
                            {shortDate(res.checkIn)} <span className="text-muted">→</span> {shortDate(res.checkOut)}
                          </p>
                          {n && <p className="text-[11.5px] text-muted">{n} nuit{n > 1 ? 's' : ''}</p>}
                        </div>
                        <div className="w-[104px] flex justify-end shrink-0">
                          <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </motion.div>

        {/* At a glance + shortcuts */}
        <motion.div {...fadeUp(0.2)} className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>En un coup d'œil</CardTitle>
            </CardHeader>
            <ul className="divide-y divide-line">
              {glance.map(({ label, value, icon: Icon, tone, to }) => (
                <li key={label}>
                  <Link
                    to={to}
                    className="group flex items-center gap-3.5 px-5 sm:px-6 py-4 hover:bg-surface-2/50 transition-colors"
                  >
                    <span className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tone)}>
                      <Icon size={16} />
                    </span>
                    <span className="flex-1 text-[13.5px] text-ink-soft">{label}</span>
                    {isLoading ? (
                      <Skeleton className="h-6 w-10" />
                    ) : (
                      <span className="font-display font-semibold text-[22px] leading-none text-ink tabular">{value}</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Link to="/concierge-ia" className="block group">
            <Card className="relative overflow-hidden p-6 hover:border-line-strong transition-colors">
              <div className="relative flex items-start gap-4">
                <span className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <BrainCircuit size={18} className="text-on-primary" />
                </span>
                <div className="flex-1">
                  <p className="font-display font-semibold text-[17px] leading-tight text-ink">Concierge IA</p>
                  <p className="text-[13px] text-muted mt-1">
                    Posez une question sur vos villas, réservations ou documents.
                  </p>
                </div>
                <ArrowUpRight
                  size={18}
                  className="text-muted group-hover:text-accent group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-all"
                />
              </div>
            </Card>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
