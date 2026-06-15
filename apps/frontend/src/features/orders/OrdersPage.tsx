import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, ShoppingBag } from 'lucide-react';
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
  const { user } = useAuthStore();
  const isClient = user?.role === 'CLIENT';
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [countryFilter, setCountryFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data: countriesData } = useCountries();
  const countries = countriesData ?? [];

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
  const staffCols = ['#', 'Client', 'Villa', 'Services', 'Montant', 'Statut', 'Prestataire', 'Date', ''];
  const clientCols = ['#', 'Services', 'Villa', 'Date', 'Montant', 'Statut', ''];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title={isClient ? 'Mes commandes' : 'Commandes'}
        description={isClient ? 'Historique de vos commandes de services' : 'Gestion des commandes de services'}
      >
        {!isClient && (
          <Button icon={<Plus size={14} />} onClick={() => navigate('/commandes/new')}>
            Nouvelle commande
          </Button>
        )}
      </PageHeader>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 border-b border-[#242428]">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => { setStatusFilter(tab.value); setPage(1); }}
            className={[
              'px-4 py-2.5 text-sm transition-colors duration-150 border-b-2 -mb-px',
              statusFilter === tab.value
                ? 'text-[#C9A96E] border-[#C9A96E] font-medium'
                : 'text-[#6B6B6F] border-transparent hover:text-[#F5F0EB]',
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
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B6B6F] pointer-events-none" />
            <Input
              placeholder="Rechercher client, villa, service…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>
          {countries.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setCountryFilter(''); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${!countryFilter ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
              >
                Tous les pays
              </button>
              {countries.map((c) => (
                <button
                  key={c.code}
                  onClick={() => { setCountryFilter(c.name); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${countryFilter === c.name ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
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
              <tr className="border-b border-[#242428]">
                {(isClient ? clientCols : staffCols).map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-[#6B6B6F] uppercase tracking-wider"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#242428]">
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
                      <ShoppingBag size={32} className="mx-auto text-[#242428] mb-3" />
                      <p className="text-sm text-[#6B6B6F]">
                        {isClient ? 'Aucune commande pour le moment' : 'Aucune commande trouvée'}
                      </p>
                    </td>
                  </tr>
                )
                : orders.map((order: any, i: number) => (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                      className="hover:bg-[#1A1A1D] cursor-pointer transition-colors"
                      onClick={() => navigate(`/commandes/${order.id}`)}
                    >
                      <td className="px-4 py-3 text-xs text-[#6B6B6F] font-mono">
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
                            <span className="text-sm text-[#F5F0EB]">
                              {order.client?.firstName} {order.client?.lastName}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* Services */}
                      <td className="px-4 py-3 text-sm text-[#F5F0EB]">
                        {order.items?.length
                          ? order.items.slice(0, 2).map((it: any) => it.service?.name).join(', ') +
                            (order.items.length > 2 ? ` +${order.items.length - 2}` : '')
                          : '—'}
                      </td>

                      {/* Villa */}
                      <td className="px-4 py-3 text-sm text-[#6B6B6F]">
                        {order.reservation?.villa?.name ?? '—'}
                      </td>

                      {/* Staff-only: provider + date order */}
                      {!isClient && (
                        <>
                          <td className="px-4 py-3 text-sm font-light text-[#C9A96E]">
                            {formatCurrency(order.totalAmount)}
                          </td>
                          <td className="px-4 py-3">
                            <OrderStatusBadge status={order.status} />
                          </td>
                          <td className="px-4 py-3 text-sm text-[#6B6B6F]">
                            {order.provider
                              ? `${order.provider.user?.firstName} ${order.provider.user?.lastName}`
                              : <span className="text-[#3A3A3E] italic text-xs">Non assigné</span>}
                          </td>
                        </>
                      )}

                      {/* Date */}
                      <td className="px-4 py-3 text-xs text-[#6B6B6F]">
                        {formatDate(order.createdAt)}
                      </td>

                      {/* Client-only: montant + statut after date */}
                      {isClient && (
                        <>
                          <td className="px-4 py-3 text-sm font-light text-[#C9A96E]">
                            {formatCurrency(order.totalAmount)}
                          </td>
                          <td className="px-4 py-3">
                            <OrderStatusBadge status={order.status} />
                          </td>
                        </>
                      )}

                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); navigate(`/commandes/${order.id}`); }}
                        >
                          Voir
                        </Button>
                      </td>
                    </motion.tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#242428]">
            <p className="text-xs text-[#6B6B6F]">
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
