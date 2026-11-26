import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { TrendingUp, Sparkles, DollarSign, BarChart3, Download, FileText, Table } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { RevenueChart } from './RevenueChart';
import { PayoutsTable, type PayoutRow } from './PayoutsTable';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency } from '../../lib/utils';

type Period = 'day' | 'week' | 'month' | 'year';
type PayoutsTab = 'provider' | 'owner';

const PERIODS: { label: string; value: Period }[] = [
  { label: 'Jour', value: 'day' },
  { label: 'Semaine', value: 'week' },
  { label: 'Mois', value: 'month' },
  { label: 'Année', value: 'year' },
];

async function fetchDashboard(period: Period) {
  const res = await apiClient.get(`/finance/dashboard?period=${period}`);
  return res.data?.data ?? res.data;
}

async function fetchProviderPayouts(month: number, year: number) {
  const res = await apiClient.get(`/finance/provider-payouts?month=${month}&year=${year}`);
  return res.data?.data ?? res.data ?? [];
}

async function fetchOwnerPayouts(month: number, year: number) {
  const res = await apiClient.get(`/finance/owner-payouts?month=${month}&year=${year}`);
  return res.data?.data ?? res.data ?? [];
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  delay: number;
}

function KpiCard({ label, value, icon: Icon, color, bgColor, delay }: KpiCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25 }}
    >
      <Card className="p-6 h-full">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted">{label}</p>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
            <Icon size={16} className={color} />
          </div>
        </div>
        <p className="font-display font-semibold text-[28px] leading-none tracking-tight text-ink tabular mt-4">
          {formatCurrency(value)}
        </p>
      </Card>
    </motion.div>
  );
}

function RankedBar({ name, amount, maxAmount }: { name: string; amount: number; maxAmount: number }) {
  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-ink truncate">{name}</p>
          <p className="text-sm font-normal text-accent ml-2 shrink-0">{formatCurrency(amount)}</p>
        </div>
        <div className="h-1.5 bg-line rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="h-full bg-accent rounded-full"
          />
        </div>
      </div>
    </div>
  );
}

export function FinancePage() {
  const [period, setPeriod] = useState<Period>('month');
  const [payoutsTab, setPayoutsTab] = useState<PayoutsTab>('provider');
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['finance-dashboard', period],
    queryFn: () => fetchDashboard(period),
  });

  const { data: providerPayouts = [], isLoading: loadingProviders } = useQuery({
    queryKey: ['provider-payouts', currentMonth, currentYear],
    queryFn: () => fetchProviderPayouts(currentMonth, currentYear),
  });

  const { data: ownerPayouts = [], isLoading: loadingOwners } = useQuery({
    queryKey: ['owner-payouts', currentMonth, currentYear],
    queryFn: () => fetchOwnerPayouts(currentMonth, currentYear),
  });

  async function handleExport(format: 'pdf' | 'excel' | 'csv') {
    setIsExporting(format);
    try {
      const response = await apiClient.get(`/finance/export?period=${period}&format=${format}`, {
        responseType: 'blob',
      });
      const ext = format === 'excel' ? 'xlsx' : format;
      const contentType =
        format === 'pdf'
          ? 'application/pdf'
          : format === 'excel'
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv';
      const blob = new Blob([response.data], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rapport-finances-${period}-${now.toISOString().split('T')[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // toast is handled by apiClient interceptor
    } finally {
      setIsExporting(null);
    }
  }

  const kpis: KpiCardProps[] = [
    {
      label: 'CA Total',
      value: dashboard?.totalRevenue ?? 0,
      icon: TrendingUp,
      color: 'text-accent',
      bgColor: 'bg-gold/15',
      delay: 0,
    },
    {
      label: 'CA Services',
      value: dashboard?.serviceRevenue ?? 0,
      icon: Sparkles,
      color: 'text-plum',
      bgColor: 'bg-plum/10',
      delay: 0.05,
    },
    {
      label: 'Commissions',
      value: dashboard?.totalCommissions ?? 0,
      icon: DollarSign,
      color: 'text-info',
      bgColor: 'bg-info/10',
      delay: 0.1,
    },
    {
      label: 'Marge conciergerie',
      value: dashboard?.conciergeMargin ?? 0,
      icon: BarChart3,
      color: 'text-success',
      bgColor: 'bg-success/10',
      delay: 0.15,
    },
  ];

  const villaData: { name: string; amount: number }[] = dashboard?.revenueByVilla ?? [];
  const serviceData: { name: string; amount: number }[] = dashboard?.revenueByService ?? [];
  const maxVilla = Math.max(...villaData.map((v) => v.amount), 1);
  const maxService = Math.max(...serviceData.map((s) => s.amount), 1);

  // Map to PayoutRow shape
  const providerRows: PayoutRow[] = providerPayouts.map((p: any) => ({
    id: p.providerId,
    name: p.name,
    grossAmount: p.grossAmount,
    commission: p.commission,
    netAmount: p.netAmount,
    orderCount: p.orderCount,
  }));

  const ownerRows: PayoutRow[] = ownerPayouts.map((o: any) => ({
    id: o.villaId,
    name: `${o.name} — ${o.ownerName}`,
    grossAmount: o.grossAmount,
    managementFee: o.managementFee,
    netAmount: o.netAmount,
    stayCount: o.stayCount,
  }));

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader title="Finances" description="Vue d'ensemble financière">
        {/* Period selector */}
        <div className="flex items-center gap-1 bg-surface border border-line rounded-lg p-1">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={[
                'px-3 py-1.5 text-xs rounded-md transition-all duration-150',
                period === p.value
                  ? 'bg-primary text-on-primary font-medium'
                  : 'text-muted hover:text-ink',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        {/* Export buttons */}
        <Button
          variant="secondary"
          size="sm"
          icon={<FileText size={13} />}
          loading={isExporting === 'pdf'}
          onClick={() => handleExport('pdf')}
        >
          PDF
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Table size={13} />}
          loading={isExporting === 'excel'}
          onClick={() => handleExport('excel')}
        >
          Excel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          icon={<Download size={13} />}
          loading={isExporting === 'csv'}
          onClick={() => handleExport('csv')}
        >
          CSV
        </Button>
      </PageHeader>

      {/* KPI row */}
      {isLoading ? (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </div>
      )}

      {/* Revenue chart */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Chiffre d'affaires par jour</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <RevenueChart data={dashboard?.revenueByDay ?? []} />
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Villa & Service ranked lists */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>CA par Villa</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : villaData.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">Aucune donnée</p>
              ) : (
                <div className="divide-y divide-line">
                  {villaData.slice(0, 8).map((v) => (
                    <RankedBar key={v.name} name={v.name} amount={v.amount} maxAmount={maxVilla} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle>CA par Service</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : serviceData.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">Aucune donnée</p>
              ) : (
                <div className="divide-y divide-line">
                  {serviceData.slice(0, 8).map((s) => (
                    <RankedBar key={s.name} name={s.name} amount={s.amount} maxAmount={maxService} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Reversements section */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.3 }}
      >
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Reversements</CardTitle>
            {/* Tab toggle */}
            <div className="flex items-center gap-1 bg-canvas border border-line rounded-lg p-1">
              {(['provider', 'owner'] as PayoutsTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setPayoutsTab(tab)}
                  className={[
                    'px-4 py-1.5 text-xs rounded-md transition-all duration-150',
                    payoutsTab === tab
                      ? 'bg-surface-2 text-ink border border-line'
                      : 'text-muted hover:text-ink',
                  ].join(' ')}
                >
                  {tab === 'provider' ? 'Prestataires' : 'Propriétaires'}
                </button>
              ))}
            </div>
          </CardHeader>
          {payoutsTab === 'provider' ? (
            loadingProviders ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : (
              <PayoutsTable type="provider" data={providerRows} />
            )
          ) : loadingOwners ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
            </div>
          ) : (
            <PayoutsTable type="owner" data={ownerRows} />
          )}
        </Card>
      </motion.div>
    </div>
  );
}
