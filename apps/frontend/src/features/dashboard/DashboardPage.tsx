import { motion } from 'framer-motion';
import {
  TrendingUp,
  Sparkles,
  Home,
  CalendarDays,
  ShoppingBag,
  Star,
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

// Mock KPI data — in production this comes from React Query
const KPI_DATA = [
  {
    label: 'CA Global',
    value: 284500,
    change: +12.4,
    icon: TrendingUp,
    format: 'currency',
    color: 'text-[#C9A96E]',
    bgColor: 'bg-[#C9A96E]/10',
  },
  {
    label: 'CA Services',
    value: 48200,
    change: +8.1,
    icon: Sparkles,
    format: 'currency',
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/20',
  },
  {
    label: "Taux d'occupation",
    value: 78,
    change: +3.2,
    icon: Home,
    format: 'percent',
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/20',
  },
  {
    label: 'Séjours actifs',
    value: 12,
    change: +2,
    icon: CalendarDays,
    format: 'number',
    color: 'text-green-400',
    bgColor: 'bg-green-900/20',
  },
  {
    label: 'Commandes en cours',
    value: 34,
    change: -1,
    icon: ShoppingBag,
    format: 'number',
    color: 'text-orange-400',
    bgColor: 'bg-orange-900/20',
  },
  {
    label: 'Satisfaction',
    value: 4.8,
    change: +0.2,
    icon: Star,
    format: 'rating',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-900/20',
  },
];

const RECENT_RESERVATIONS = [
  {
    id: '1',
    client: { firstName: 'Alexandre', lastName: 'Dupont' },
    villa: 'Villa Émeraude',
    checkIn: '2024-03-15',
    checkOut: '2024-03-22',
    status: 'ACTIVE',
    amount: 12500,
  },
  {
    id: '2',
    client: { firstName: 'Sophie', lastName: 'Martin' },
    villa: 'Villa Saphir',
    checkIn: '2024-03-18',
    checkOut: '2024-03-25',
    status: 'CONFIRMED',
    amount: 8900,
  },
  {
    id: '3',
    client: { firstName: 'Jean-Pierre', lastName: 'Moreau' },
    villa: 'Villa Diamant',
    checkIn: '2024-03-20',
    checkOut: '2024-03-28',
    status: 'PENDING',
    amount: 15200,
  },
  {
    id: '4',
    client: { firstName: 'Claire', lastName: 'Bernard' },
    villa: 'Villa Rubis',
    checkIn: '2024-03-22',
    checkOut: '2024-03-29',
    status: 'CONFIRMED',
    amount: 9800,
  },
  {
    id: '5',
    client: { firstName: 'Marc', lastName: 'Leclerc' },
    villa: 'Villa Opale',
    checkIn: '2024-03-10',
    checkOut: '2024-03-17',
    status: 'COMPLETED',
    amount: 7600,
  },
];

const TOP_VILLAS = [
  { id: '1', name: 'Villa Émeraude', city: 'Saint-Tropez', revenue: 84500, occupancy: 92, reservations: 18 },
  { id: '2', name: 'Villa Saphir', city: 'Cannes', revenue: 67200, occupancy: 85, reservations: 14 },
  { id: '3', name: 'Villa Diamant', city: 'Nice', revenue: 52100, occupancy: 78, reservations: 11 },
  { id: '4', name: 'Villa Rubis', city: 'Monaco', revenue: 48900, occupancy: 71, reservations: 9 },
  { id: '5', name: 'Villa Opale', city: 'Antibes', revenue: 31800, occupancy: 65, reservations: 7 },
];

const STATUS_CONFIG: Record<string, { label: string; variant: 'active' | 'confirmed' | 'pending' | 'completed' | 'cancelled' }> = {
  ACTIVE: { label: 'Active', variant: 'active' },
  CONFIRMED: { label: 'Confirmée', variant: 'confirmed' },
  PENDING: { label: 'En attente', variant: 'pending' },
  COMPLETED: { label: 'Terminée', variant: 'completed' },
  CANCELLED: { label: 'Annulée', variant: 'cancelled' },
};

function formatKpiValue(value: number, format: string): string {
  switch (format) {
    case 'currency': return formatCurrency(value);
    case 'percent': return `${value}%`;
    case 'rating': return `${value}/5`;
    default: return value.toString();
  }
}

function KpiCard({
  label,
  value,
  change,
  icon: Icon,
  format,
  color,
  bgColor,
  delay,
}: (typeof KPI_DATA)[0] & { delay: number }) {
  const isPositive = change >= 0;
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
            <p className="text-2xl font-light text-[#F5F0EB] mt-2">
              {formatKpiValue(value, format)}
            </p>
            <div
              className={`flex items-center gap-1 mt-2 text-xs font-medium ${
                isPositive ? 'text-green-400' : 'text-red-400'
              }`}
            >
              {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              <span>
                {isPositive ? '+' : ''}{change}
                {format === 'currency' ? '%' : format === 'percent' ? ' pts' : ''}
                {' '}vs mois dernier
              </span>
            </div>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bgColor}`}>
            <Icon size={18} className={color} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function DashboardPage() {
  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Dashboard"
        description={`Bonjour — ${today.charAt(0).toUpperCase() + today.slice(1)}`}
      />

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {KPI_DATA.map((kpi, i) => (
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
                <span>Mise à jour maintenant</span>
              </div>
            </CardHeader>
            <div className="divide-y divide-[#242428]">
              {RECENT_RESERVATIONS.map((res) => {
                const statusConf = STATUS_CONFIG[res.status];
                return (
                  <div
                    key={res.id}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#1A1A1D] transition-colors cursor-pointer"
                  >
                    <Avatar
                      firstName={res.client.firstName}
                      lastName={res.client.lastName}
                      size="sm"
                    />
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
                      <p className="text-sm font-light text-[#C9A96E]">
                        {formatCurrency(res.amount)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
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
            <div className="divide-y divide-[#242428]">
              {TOP_VILLAS.map((villa, index) => (
                <div key={villa.id} className="px-5 py-3.5 hover:bg-[#1A1A1D] transition-colors cursor-pointer">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-[#6B6B6F] w-4 shrink-0">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#F5F0EB] font-light truncate">{villa.name}</p>
                      <p className="text-xs text-[#6B6B6F]">{villa.city}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-light text-[#C9A96E]">
                        {formatCurrency(villa.revenue)}
                      </p>
                      <p className="text-xs text-[#6B6B6F]">{villa.occupancy}% occ.</p>
                    </div>
                  </div>
                  {/* Occupancy bar */}
                  <div className="mt-2 ml-7">
                    <div className="h-1 bg-[#242428] rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${villa.occupancy}%` }}
                        transition={{ delay: 0.5 + index * 0.1, duration: 0.5, ease: 'easeOut' }}
                        className="h-full bg-[#C9A96E] rounded-full"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#C9A96E]/10 flex items-center justify-center">
                <Users size={14} className="text-[#C9A96E]" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Clients actifs ce mois</p>
            </div>
            <p className="text-3xl font-light text-[#F5F0EB]">48</p>
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
              <ArrowUpRight size={11} /> +6 vs mois dernier
            </p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.3 }}
        >
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-900/20 flex items-center justify-center">
                <Building2 size={14} className="text-blue-400" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Villas actives</p>
            </div>
            <p className="text-3xl font-light text-[#F5F0EB]">23</p>
            <p className="text-xs text-[#6B6B6F] mt-1">Sur 28 au total</p>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.3 }}
        >
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-900/20 flex items-center justify-center">
                <Sparkles size={14} className="text-orange-400" />
              </div>
              <p className="text-sm text-[#6B6B6F]">Services commandés</p>
            </div>
            <p className="text-3xl font-light text-[#F5F0EB]">127</p>
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
              <ArrowUpRight size={11} /> +23% vs mois dernier
            </p>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
