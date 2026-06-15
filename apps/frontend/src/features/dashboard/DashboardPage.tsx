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

function ChangeIndicator({ value, suffix = '%' }: { value: number; suffix?: string }) {
  const isPositive = value >= 0;
  return (
    <div className={`flex items-center gap-1 mt-2 text-xs font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
      {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      <span>{isPositive ? '+' : ''}{value}{suffix} vs mois dernier</span>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton className="h-3 w-24 mb-3" />
          <Skeleton className="h-7 w-32 mb-2" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="w-10 h-10 rounded-xl" />
      </div>
    </Card>
  );
}

function KpiCard({
  label, value, change, icon: Icon, format, color, bgColor, delay, suffix = '%',
}: {
  label: string; value: number; change: number; icon: any;
  format: 'currency' | 'percent' | 'number'; color: string; bgColor: string;
  delay: number; suffix?: string;
}) {
  const formatted =
    format === 'currency' ? formatCurrency(value) :
    format === 'percent' ? `${value}%` :
    value.toString();

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3, ease: 'easeOut' }}>
      <Card className="p-5 hover:border-[#C9A96E]/20 transition-all duration-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-[#6B6B6F] uppercase tracking-wider font-medium">{label}</p>
            <p className="text-2xl font-light text-[#F5F0EB] mt-2">{formatted}</p>
            <ChangeIndicator value={change} suffix={suffix} />
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
            <Icon size={18} className={color} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function buildKpis(kpis: DashboardKpis) {
  return [
    {
      label: 'CA Global',
      value: kpis.totalRevenue,
      change: kpis.revenueChange,
      icon: TrendingUp,
      format: 'currency' as const,
      color: 'text-[#C9A96E]',
      bgColor: 'bg-[#C9A96E]/10',
      suffix: '%',
    },
    {
      label: 'CA Services',
      value: kpis.serviceRevenue,
      change: kpis.serviceRevenueChange,
      icon: Sparkles,
      format: 'currency' as const,
      color: 'text-purple-400',
      bgColor: 'bg-purple-900/20',
      suffix: '%',
    },
    {
      label: "Taux d'occupation",
      value: kpis.occupancyRate,
      change: 0,
      icon: Home,
      format: 'percent' as const,
      color: 'text-blue-400',
      bgColor: 'bg-blue-900/20',
      suffix: ' pts',
    },
    {
      label: 'Séjours actifs',
      value: kpis.activeReservations,
      change: 0,
      icon: CalendarDays,
      format: 'number' as const,
      color: 'text-green-400',
      bgColor: 'bg-green-900/20',
      suffix: '',
    },
    {
      label: 'Commandes en cours',
      value: kpis.pendingOrders,
      change: kpis.pendingOrdersChange,
      icon: ShoppingBag,
      format: 'number' as const,
      color: 'text-orange-400',
      bgColor: 'bg-orange-900/20',
      suffix: '%',
    },
    {
      label: 'Services ce mois',
      value: kpis.ordersThisMonth,
      change: kpis.ordersChange,
      icon: Sparkles,
      format: 'number' as const,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900/20',
      suffix: '%',
    },
  ];
}

export function DashboardPage() {
  const { data, isLoading } = useDashboard();

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Dashboard"
        description={`Bonjour — ${today.charAt(0).toUpperCase() + today.slice(1)}`}
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading || !data
          ? Array.from({ length: 6 }).map((_, i) => <KpiSkeleton key={i} />)
          : buildKpis(data.kpis).map((kpi, i) => (
              <KpiCard key={kpi.label} {...kpi} delay={i * 0.05} />
            ))}
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
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex-1">
                      <Skeleton className="h-3 w-32 mb-1.5" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : data?.recentReservations.length === 0 ? (
              <CardContent>
                <p className="text-sm text-[#6B6B6F] text-center py-8">Aucune réservation pour le moment</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-[#242428]">
                {(data?.recentReservations ?? []).map((res) => {
                  const statusConf = STATUS_CONFIG[res.status] ?? { label: res.status, variant: 'pending' as const };
                  return (
                    <div
                      key={res.id}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#1A1A1D] transition-colors cursor-pointer"
                    >
                      <Avatar firstName={res.client.firstName} lastName={res.client.lastName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#F5F0EB] font-light truncate">
                          {res.client.firstName} {res.client.lastName}
                        </p>
                        <p className="text-xs text-[#6B6B6F] truncate">{res.villa}</p>
                      </div>
                      <div className="hidden sm:block text-right shrink-0">
                        <p className="text-xs text-[#6B6B6F]">
                          {formatDate(res.checkIn)} — {formatDate(res.checkOut)}
                        </p>
                      </div>
                      <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
                      <div className="text-right shrink-0 w-24">
                        <p className="text-sm font-light text-[#C9A96E]">{formatCurrency(res.amount)}</p>
                      </div>
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

        {/* Top Villas */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Villas</CardTitle>
              <Building2 size={14} className="text-[#6B6B6F]" />
            </CardHeader>

            {isLoading ? (
              <div className="divide-y divide-[#242428]">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <Skeleton className="w-4 h-3" />
                      <div className="flex-1">
                        <Skeleton className="h-3 w-28 mb-1.5" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <div>
                        <Skeleton className="h-3 w-16 mb-1" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                    </div>
                    <Skeleton className="h-1 mt-2 ml-7 rounded-full" />
                  </div>
                ))}
              </div>
            ) : data?.topVillas.length === 0 ? (
              <CardContent>
                <p className="text-sm text-[#6B6B6F] text-center py-8">Aucune villa active ce mois</p>
              </CardContent>
            ) : (
              <div className="divide-y divide-[#242428]">
                {(data?.topVillas ?? []).map((villa, index) => (
                  <div key={villa.id} className="px-5 py-3.5 hover:bg-[#1A1A1D] transition-colors cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-medium text-[#6B6B6F] w-4 shrink-0">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#F5F0EB] font-light truncate">{villa.name}</p>
                        <p className="text-xs text-[#6B6B6F]">{villa.city}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-light text-[#C9A96E]">{formatCurrency(villa.revenue)}</p>
                        <p className="text-xs text-[#6B6B6F]">{villa.reservations} rés.</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="px-5 py-3 border-t border-[#242428]">
              <a href="/villas" className="text-xs text-[#C9A96E] hover:text-[#E8C98A] transition-colors">
                Voir toutes les villas →
              </a>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.3 }}>
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#C9A96E]/10 flex items-center justify-center">
                <Users size={14} className="text-[#C9A96E]" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Clients actifs ce mois</p>
            </div>
            {isLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-light text-[#F5F0EB]">{data?.kpis.activeClients ?? 0}</p>
            )}
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.3 }}>
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
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.3 }}>
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
              <>
                <p className="text-3xl font-light text-[#F5F0EB]">{data?.kpis.ordersThisMonth ?? 0}</p>
                {data && data.kpis.ordersChange !== 0 && (
                  <ChangeIndicator value={data.kpis.ordersChange} />
                )}
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
