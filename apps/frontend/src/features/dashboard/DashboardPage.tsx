import { motion } from 'framer-motion';
import {
  TrendingUp,
  Sparkles,
  Home,
  CalendarDays,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Users,
  Clock,
} from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { formatCurrency, formatDate } from '../../lib/utils';
import { useDashboard, DashboardKpis } from './useDashboard';

const STATUS_CONFIG: Record<string, { label: string; variant: 'active' | 'confirmed' | 'pending' | 'completed' | 'cancelled' }> = {
  ACTIVE: { label: 'Active', variant: 'active' },
  CONFIRMED: { label: 'Confirmée', variant: 'confirmed' },
  PENDING: { label: 'En attente', variant: 'pending' },
  COMPLETED: { label: 'Terminée', variant: 'completed' },
  CANCELLED: { label: 'Annulée', variant: 'cancelled' },
};

function ChangeIndicator({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      <span>{isPositive ? '+' : ''}{value}% vs mois dernier</span>
    </div>
  );
}

function buildKpis(kpis: DashboardKpis) {
  return [
    {
      label: 'CA ce mois',
      value: formatCurrency(kpis.totalRevenue),
      change: kpis.revenueChange,
      icon: TrendingUp,
      color: 'text-[#C9A96E]',
      bgColor: 'bg-[#C9A96E]/10',
    },
    {
      label: "Taux d'occupation",
      value: `${kpis.occupancyRate}%`,
      change: 0,
      icon: Home,
      color: 'text-blue-400',
      bgColor: 'bg-blue-900/20',
    },
    {
      label: 'Séjours actifs',
      value: kpis.activeReservations.toString(),
      change: 0,
      icon: CalendarDays,
      color: 'text-green-400',
      bgColor: 'bg-green-900/20',
    },
    {
      label: 'Commandes en attente',
      value: kpis.pendingOrders.toString(),
      change: 0,
      icon: ShoppingBag,
      color: 'text-orange-400',
      bgColor: 'bg-orange-900/20',
    },
    {
      label: 'Villas actives',
      value: `${kpis.activeVillas} / ${kpis.totalVillas}`,
      change: 0,
      icon: Building2,
      color: 'text-purple-400',
      bgColor: 'bg-purple-900/20',
    },
    {
      label: 'Nouveaux clients',
      value: kpis.activeClients.toString(),
      change: 0,
      icon: Users,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900/20',
    },
  ];
}

function KpiCard({
  label,
  value,
  change,
  icon: Icon,
  color,
  bgColor,
  delay,
}: ReturnType<typeof buildKpis>[0] & { delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
    >
      <Card className="p-5 hover:border-[#C9A96E]/20 transition-all duration-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#6B6B6F] uppercase tracking-wider font-medium">{label}</p>
            <p className="text-2xl font-light text-[#F5F0EB] mt-2">{value}</p>
            {change !== 0 && <ChangeIndicator value={change} />}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
            <Icon size={18} className={color} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function KpiSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="w-10 h-10 rounded-xl" />
      </div>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard();

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const kpis = data ? buildKpis(data.kpis) : [];
  const recentReservations = data?.recentReservations ?? [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Dashboard"
        description={`Bonjour — ${today.charAt(0).toUpperCase() + today.slice(1)}`}
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((kpi, i) => (
              <KpiCard key={kpi.label} {...kpi} delay={i * 0.05} />
            ))
        }
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent Reservations */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="xl:col-span-2"
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Réservations récentes</CardTitle>
              <div className="flex items-center gap-2 text-xs text-[#6B6B6F]">
                <Clock size={12} />
                <span>Temps réel</span>
              </div>
            </CardHeader>
            {isLoading ? (
              <div className="divide-y divide-[#242428]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentReservations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CalendarDays size={28} className="text-[#242428] mb-3" />
                <p className="text-sm text-[#6B6B6F]">Aucune réservation récente</p>
              </div>
            ) : (
              <div className="divide-y divide-[#242428]">
                {recentReservations.map((res) => {
                  const statusConf = STATUS_CONFIG[res.status] ?? { label: res.status, variant: 'default' as any };
                  return (
                    <div
                      key={res.id}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#1A1A1D] transition-colors cursor-pointer"
                    >
                      <Avatar
                        firstName={res.client.firstName}
                        lastName={res.client.lastName}
                        src={res.client.avatar}
                        size="sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#F5F0EB] font-light truncate">
                          {res.client.firstName} {res.client.lastName}
                        </p>
                        <p className="text-xs text-[#6B6B6F] truncate">{res.villa.name}</p>
                      </div>
                      <div className="hidden sm:block text-right shrink-0">
                        <p className="text-xs text-[#6B6B6F]">
                          {formatDate(res.checkIn)} — {formatDate(res.checkOut)}
                        </p>
                      </div>
                      <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-5 py-3 border-t border-[#242428]">
              <a href="/reservations" className="text-xs text-[#C9A96E] hover:text-[#E8C98A] transition-colors">
                Voir toutes les réservations →
              </a>
            </div>
          </Card>
        </motion.div>

        {/* Quick Stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          className="space-y-4"
        >
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#C9A96E]/10 flex items-center justify-center">
                <Users size={14} className="text-[#C9A96E]" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Clients ce mois</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-light text-[#F5F0EB]">{data?.kpis.activeClients ?? 0}</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-900/20 flex items-center justify-center">
                <Building2 size={14} className="text-blue-400" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Villas actives</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <>
                <p className="text-3xl font-light text-[#F5F0EB]">{data?.kpis.activeVillas ?? 0}</p>
                <p className="text-xs text-[#6B6B6F] mt-1">Sur {data?.kpis.totalVillas ?? 0} au total</p>
              </>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-900/20 flex items-center justify-center">
                <Sparkles size={14} className="text-orange-400" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Commandes ce mois</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-light text-[#F5F0EB]">{data?.kpis.ordersThisMonth ?? 0}</p>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
