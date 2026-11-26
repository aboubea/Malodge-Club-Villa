import { useState } from 'react';
import { MadEquivalent } from '../../lib/fx';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, ShoppingBag, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { OrderStatusBadge } from './OrderStatusBadge';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency, formatDate } from '../../lib/utils';
import { OrderStatus } from '@malodge/shared';
import { useAuthStore } from '../../store/authStore';
import { useCountries } from '../../hooks/useCountries';

type StatusFilter = 'ALL' | OrderStatus;

const STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: 'Toutes', value: 'ALL' },
  { label: 'En attente', value: OrderStatus.PENDING },
  { label: 'Confirmées', value: OrderStatus.CONFIRMED },
  { label: 'En cours', value: OrderStatus.IN_PROGRESS },
  { label: 'Terminées', value: OrderStatus.COMPLETED },
  { label: 'Annulées', value: OrderStatus.CANCELLED },
];

async function fetchOrders(params: {
  page: number;
  limit: number;
  status?: OrderStatus;
  search?: string;
  country?: string;
}) {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
    ...(params.status ? { status: params.status } : {}),
    ...(params.search ? { search: params.search } : {}),
    ...(params.country ? { country: params.country } : {}),
  });
  const res = await apiClient.get(`/orders?${query}`);
  return res.data?.data ?? res.data;
}

export function OrdersPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isClient = user?.role === 'CLIENT';
  const isManager = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [countryFilter, setCountryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: countriesData } = useCountries();
  const countries = countriesData ?? [];

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
      apiClient.patch(`/orders/${id}/status`, { status }),
    onSuccess: (_, { status }) => {
      toast.success(status === OrderStatus.CONFIRMED ? 'Demande acceptée' : 'Demande refusée');
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['orders', page, statusFilter, search, countryFilter],
    queryFn: () =>
      fetchOrders({
        page,
        limit,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search || undefined,
        country: countryFilter || undefined,
      }),
  });

  const orders = data?.data ?? [];
  const meta = data?.meta;

  // Columns differ by role
  const staffCols = ['#', 'Client', 'Services', 'Villa', 'Montant', 'Statut', 'Prestataire', 'Date', ''];
  const clientCols = ['#', 'Services', 'Villa', 'Date', 'Montant', 'Statut', ''];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title={isClient ? 'Mes commandes' : 'Commandes'}
        description={isClient ? 'Historique de vos commandes de services' : 'Gestion et validation des commandes de services'}
      >
        {!isClient && (
          <Button icon={<Plus size={14} />} onClick={() => navigate('/commandes/new')}>
            Nouvelle commande
          </Button>
        )}
      </PageHeader>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border-b border-line overflow-x-auto scrollbar-none">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={[
              'px-4 py-3 text-[13.5px] whitespace-nowrap transition-colors duration-150 border-b-2 -mb-px',
              statusFilter === tab.value
                ? 'text-ink border-accent font-medium'
                : 'text-muted border-transparent hover:text-ink',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + country filter — staff only */}
      {!isClient && (
        <div className="space-y-2">
          <div className="relative max-w-sm">
            <Input
              placeholder="Rechercher client, villa, service…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              leftIcon={<Search size={15} />}
            />
          </div>
          {countries.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setCountryFilter(''); setPage(1); }}
                className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${!countryFilter ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
              >
                Tous les pays
              </button>
              {countries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => { setCountryFilter(c.name); setPage(1); }}
                  className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${countryFilter === c.name ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
                >
                  {c.flag} {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line">
                {(isClient ? clientCols : staffCols).map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-[12.5px] font-semibold text-muted"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {(isClient ? clientCols : staffCols).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : orders.length === 0
                ? (
                  <tr>
                    <td colSpan={isClient ? clientCols.length : staffCols.length} className="px-4 py-16 text-center">
                      <ShoppingBag size={32} className="mx-auto text-line-strong mb-3" />
                      <p className="text-sm text-muted mb-3">
                        {isClient ? 'Aucune commande pour le moment' : 'Aucune commande trouvée'}
                      </p>
                      {isClient && (
                        <button
                          onClick={() => navigate('/catalogue')}
                          className="px-4 py-2 rounded-lg text-xs bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-colors"
                        >
                          Découvrir les services →
                        </button>
                      )}
                    </td>
                  </tr>
                )
                : orders.map((order: any, i: number) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                      className="hover:bg-surface-2 cursor-pointer transition-colors"
                      onClick={() => navigate(`/commandes/${order.id}`)}
                    >
                      <td className="px-4 py-3 text-xs text-muted font-mono">
                        #{order.id.slice(-6).toUpperCase()}
                      </td>

                      {/* Staff-only: client column */}
                      {!isClient && (
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar
                              firstName={order.client?.firstName}
                              lastName={order.client?.lastName}
                              src={order.client?.avatar}
                              size="sm"
                            />
                            <span className="text-sm text-ink">
                              {order.client?.firstName} {order.client?.lastName}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Services */}
                      <td className="px-4 py-3 text-sm text-ink">
                        {order.items?.length
                          ? order.items.slice(0, 2).map((it: any) => it.service?.name ?? it.label).join(', ') +
                            (order.items.length > 2 ? ` +${order.items.length - 2}` : '')
                          : '—'}
                      </td>

                      {/* Villa */}
                      <td className="px-4 py-3 text-sm text-muted">
                        {order.reservation?.villa?.name ?? '—'}
                      </td>

                      {/* Staff-only: provider + date order */}
                      {!isClient && (
                        <>
                          <td className="px-4 py-3 text-sm font-normal text-accent">
                            {formatCurrency(order.totalAmount, order.currency)}
                            <MadEquivalent amount={order.totalAmount} currency={order.currency} className="block text-[11px] text-muted" />
                          </td>
                          <td className="px-4 py-3">
                            <OrderStatusBadge status={order.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-muted">
                            {order.provider
                              ? `${order.provider.user?.firstName} ${order.provider.user?.lastName}`
                              : <span className="text-muted italic text-xs">Non assigné</span>}
                          </td>
                        </>
                      )}

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-muted">
                        {formatDate(order.createdAt)}
                      </td>

                      {/* Client-only: montant + statut after date */}
                      {isClient && (
                        <>
                          <td className="px-4 py-3 text-sm font-normal text-accent">
                            {formatCurrency(order.totalAmount, order.currency)}
                            <MadEquivalent amount={order.totalAmount} currency={order.currency} className="block text-[11px] text-muted" />
                          </td>
                          <td className="px-4 py-3">
                            <OrderStatusBadge status={order.status} />
                          </td>
                        </>
                      )}

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {isManager && order.status === OrderStatus.PENDING && (
                            <>
                              <button
                                onClick={() => statusMutation.mutate({ id: order.id, status: OrderStatus.CONFIRMED })}
                                disabled={statusMutation.isPending}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-success border border-success/25 bg-success/10 hover:bg-success/10 transition-colors"
                                title="Accepter"
                              >
                                <CheckCircle2 size={11} /> Accepter
                              </button>
                              <button
                                onClick={() => statusMutation.mutate({ id: order.id, status: OrderStatus.CANCELLED })}
                                disabled={statusMutation.isPending}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-danger border border-danger/25 bg-danger/10 hover:bg-danger/10 transition-colors"
                                title="Refuser"
                              >
                                <XCircle size={11} /> Refuser
                              </button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(`/commandes/${order.id}`)}
                          >
                            Voir
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line">
            <p className="text-xs text-muted">
              {meta.total} commande{meta.total !== 1 ? 's' : ''} — Page {meta.page}/{meta.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Précédent
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
