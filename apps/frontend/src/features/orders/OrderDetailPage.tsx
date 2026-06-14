import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronRight, CheckCircle2, Clock, XCircle, AlertCircle, Loader2, User, CreditCard } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Skeleton } from '../../components/ui/Skeleton';
import { OrderStatusBadge } from './OrderStatusBadge';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency, formatDate, formatDateLong } from '../../lib/utils';
import { OrderStatus, PaymentStatus, PaymentMethod } from '@malodge/shared';

async function fetchOrder(id: string) {
  const res = await apiClient.get(`/orders/${id}`);
  return res.data?.data ?? res.data;
}

async function fetchProviders() {
  const res = await apiClient.get('/providers?limit=100');
  return (res.data?.data ?? res.data)?.data ?? [];
}

const ORDER_STEPS = [
  { status: OrderStatus.PENDING, label: 'En attente', icon: Clock },
  { status: OrderStatus.CONFIRMED, label: 'Confirmée', icon: CheckCircle2 },
  { status: OrderStatus.IN_PROGRESS, label: 'En cours', icon: AlertCircle },
  { status: OrderStatus.COMPLETED, label: 'Terminée', icon: CheckCircle2 },
];

const STATUS_ORDER: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_PROGRESS,
  OrderStatus.COMPLETED,
];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CARD: 'Carte bancaire',
  CASH: 'Espèces',
  TRANSFER: 'Virement',
  MANUAL: 'Manuel',
};

const PAYMENT_STATUS_VARIANT: Record<string, 'pending' | 'active' | 'cancelled' | 'completed'> = {
  PENDING: 'pending',
  PAID: 'active',
  REFUNDED: 'cancelled',
  FAILED: 'cancelled',
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedProvider, setSelectedProvider] = useState('');

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => fetchOrder(id!),
    enabled: !!id,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['providers-list'],
    queryFn: fetchProviders,
  });

  const updateStatusMutation = useMutation({
    mutationFn: (status: OrderStatus) =>
      apiClient.patch(`/orders/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      toast.success('Statut mis à jour');
    },
  });

  const assignProviderMutation = useMutation({
    mutationFn: (providerId: string) =>
      apiClient.patch(`/orders/${id}/provider`, { providerId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      toast.success('Prestataire assigné');
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: () => apiClient.post(`/payments/${order?.payment?.id}/confirm`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      toast.success('Paiement confirmé');
    },
  });

  const refundMutation = useMutation({
    mutationFn: () => apiClient.post(`/payments/${order?.payment?.id}/refund`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      toast.success('Remboursement effectué');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiClient.delete(`/orders/${id}`),
    onSuccess: () => {
      toast.success('Commande annulée');
      navigate('/commandes');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-60" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16 text-[#6B6B6F]">
        Commande introuvable
      </div>
    );
  }

  const currentStepIndex = STATUS_ORDER.indexOf(order.status as OrderStatus);
  const subtotal = order.items?.reduce((sum: number, it: any) => sum + it.total, 0) ?? order.totalAmount;
  const netToProvider = subtotal - order.commission;

  const shortId = order.id.slice(-6).toUpperCase();

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[#6B6B6F]">
        <Link to="/commandes" className="hover:text-[#F5F0EB] transition-colors">
          Commandes
        </Link>
        <ChevronRight size={14} />
        <span className="text-[#F5F0EB]">#{shortId}</span>
      </div>

      <PageHeader
        title={`Commande #${shortId}`}
        description={`Créée le ${formatDateLong(order.createdAt)}`}
      >
        <OrderStatusBadge status={order.status} size="md" />
        {order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.COMPLETED && (
          <Button
            variant="destructive"
            size="sm"
            loading={cancelMutation.isPending}
            onClick={() => {
              if (confirm('Annuler cette commande ?')) cancelMutation.mutate();
            }}
          >
            Annuler
          </Button>
        )}
      </PageHeader>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* LEFT — 2/3 */}
        <div className="xl:col-span-2 space-y-6">
          {/* Client info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User size={14} className="text-[#6B6B6F]" />
                Client
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Avatar
                  firstName={order.client?.firstName}
                  lastName={order.client?.lastName}
                  src={order.client?.avatar}
                  size="lg"
                />
                <div>
                  <p className="text-base font-light text-[#F5F0EB]">
                    {order.client?.firstName} {order.client?.lastName}
                  </p>
                  <p className="text-sm text-[#6B6B6F]">{order.client?.email}</p>
                  {order.client?.phone && (
                    <p className="text-sm text-[#6B6B6F]">{order.client?.phone}</p>
                  )}
                </div>
                {order.reservation?.villa && (
                  <div className="ml-auto text-right">
                    <p className="text-xs text-[#6B6B6F]">Villa</p>
                    <p className="text-sm text-[#F5F0EB]">{order.reservation.villa.name}</p>
                  </div>
                )}
              </div>
              {order.scheduledAt && (
                <div className="mt-4 pt-4 border-t border-[#242428]">
                  <p className="text-xs text-[#6B6B6F]">Planifiée le</p>
                  <p className="text-sm text-[#F5F0EB]">{formatDateLong(order.scheduledAt)}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Items table */}
          <Card>
            <CardHeader>
              <CardTitle>Prestations commandées</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#242428]">
                    {['Service', 'Qté', 'Prix unitaire', 'Total'].map((col) => (
                      <th
                        key={col}
                        className="px-5 py-3 text-left text-xs font-medium text-[#6B6B6F] uppercase tracking-wider"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#242428]">
                  {order.items?.map((item: any) => (
                    <tr key={item.id} className="hover:bg-[#1A1A1D] transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm text-[#F5F0EB]">{item.service?.name}</p>
                        {item.service?.category && (
                          <p className="text-xs text-[#6B6B6F]">{item.service.category.name}</p>
                        )}
                        {item.notes && (
                          <p className="text-xs text-[#6B6B6F] italic mt-0.5">{item.notes}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-[#6B6B6F]">{item.quantity}</td>
                      <td className="px-5 py-3 text-sm text-[#6B6B6F]">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="px-5 py-3 text-sm font-light text-[#C9A96E]">
                        {formatCurrency(item.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Totals */}
            <div className="border-t border-[#242428] px-5 py-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B6B6F]">Sous-total</span>
                <span className="text-[#F5F0EB]">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B6B6F]">
                  Commission ({subtotal > 0 ? Math.round((order.commission / subtotal) * 100) : 0}%)
                </span>
                <span className="text-[#6B6B6F]">- {formatCurrency(order.commission)}</span>
              </div>
              <div className="flex items-center justify-between text-sm border-t border-[#242428] pt-2 mt-2">
                <span className="text-[#F5F0EB] font-medium">Net prestataire</span>
                <span className="text-[#C9A96E] font-medium">{formatCurrency(netToProvider)}</span>
              </div>
            </div>
          </Card>

          {/* Status timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Historique de statut</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center">
                {ORDER_STEPS.map((step, index) => {
                  const stepIndex = STATUS_ORDER.indexOf(step.status);
                  const isDone = currentStepIndex >= stepIndex && order.status !== OrderStatus.CANCELLED;
                  const isCurrent = currentStepIndex === stepIndex && order.status !== OrderStatus.CANCELLED;
                  const StepIcon = step.icon;

                  return (
                    <div key={step.status} className="flex items-center flex-1 last:flex-none">
                      <div className="flex flex-col items-center">
                        <motion.div
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          className={[
                            'w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors duration-300',
                            isDone
                              ? 'bg-[#C9A96E]/20 border-[#C9A96E] text-[#C9A96E]'
                              : 'bg-[#1A1A1D] border-[#242428] text-[#6B6B6F]',
                            isCurrent && 'ring-2 ring-[#C9A96E]/30',
                          ].join(' ')}
                        >
                          <StepIcon size={14} />
                        </motion.div>
                        <p className={['text-xs mt-1.5 text-center', isDone ? 'text-[#C9A96E]' : 'text-[#6B6B6F]'].join(' ')}>
                          {step.label}
                        </p>
                      </div>
                      {index < ORDER_STEPS.length - 1 && (
                        <div
                          className={[
                            'flex-1 h-0.5 mx-2 transition-colors duration-300',
                            currentStepIndex > stepIndex && order.status !== OrderStatus.CANCELLED
                              ? 'bg-[#C9A96E]'
                              : 'bg-[#242428]',
                          ].join(' ')}
                        />
                      )}
                    </div>
                  );
                })}
                {order.status === OrderStatus.CANCELLED && (
                  <div className="flex items-center ml-4">
                    <XCircle size={20} className="text-red-400" />
                    <span className="text-xs text-red-400 ml-1">Annulée</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT — 1/3 */}
        <div className="space-y-6">
          {/* Payment card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard size={14} className="text-[#6B6B6F]" />
                Paiement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.payment ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#6B6B6F]">Méthode</span>
                    <Badge variant="default">
                      {PAYMENT_METHOD_LABEL[order.payment.method] ?? order.payment.method}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#6B6B6F]">Statut</span>
                    <Badge variant={PAYMENT_STATUS_VARIANT[order.payment.status] ?? 'default'}>
                      {order.payment.status === PaymentStatus.PAID
                        ? 'Payé'
                        : order.payment.status === PaymentStatus.PENDING
                        ? 'En attente'
                        : order.payment.status === PaymentStatus.REFUNDED
                        ? 'Remboursé'
                        : 'Échoué'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#6B6B6F]">Montant</span>
                    <span className="text-sm font-light text-[#C9A96E]">
                      {formatCurrency(order.payment.amount)}
                    </span>
                  </div>
                  {order.payment.paidAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6B6B6F]">Payé le</span>
                      <span className="text-xs text-[#F5F0EB]">{formatDate(order.payment.paidAt)}</span>
                    </div>
                  )}
                  {/* Actions */}
                  {order.payment.status === PaymentStatus.PENDING && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full mt-2"
                      loading={confirmPaymentMutation.isPending}
                      onClick={() => confirmPaymentMutation.mutate()}
                    >
                      Confirmer le paiement
                    </Button>
                  )}
                  {order.payment.status === PaymentStatus.PAID && (
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full mt-2"
                      loading={refundMutation.isPending}
                      onClick={() => {
                        if (confirm('Rembourser ce paiement ?')) refundMutation.mutate();
                      }}
                    >
                      Rembourser
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm text-[#6B6B6F] text-center py-4">
                  Aucun paiement enregistré
                </p>
              )}
            </CardContent>
          </Card>

          {/* Provider card */}
          <Card>
            <CardHeader>
              <CardTitle>Prestataire</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.provider ? (
                <div className="flex items-center gap-3">
                  <Avatar
                    firstName={order.provider.user?.firstName}
                    lastName={order.provider.user?.lastName}
                    size="sm"
                  />
                  <div>
                    <p className="text-sm text-[#F5F0EB]">
                      {order.provider.user?.firstName} {order.provider.user?.lastName}
                    </p>
                    {order.provider.companyName && (
                      <p className="text-xs text-[#6B6B6F]">{order.provider.companyName}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#6B6B6F] italic">Non assigné</p>
              )}

              {/* Assign provider */}
              {order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELLED && (
                <div className="pt-3 border-t border-[#242428] space-y-2">
                  <p className="text-xs text-[#6B6B6F]">
                    {order.provider ? 'Changer le prestataire' : 'Assigner un prestataire'}
                  </p>
                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="w-full text-sm bg-[#1A1A1D] border border-[#242428] rounded-lg px-3 py-2 text-[#F5F0EB] focus:outline-none focus:border-[#C9A96E]/50"
                  >
                    <option value="">Sélectionner…</option>
                    {providers.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.user?.firstName} {p.user?.lastName}
                        {p.companyName ? ` — ${p.companyName}` : ''}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={!selectedProvider}
                    loading={assignProviderMutation.isPending}
                    onClick={() => selectedProvider && assignProviderMutation.mutate(selectedProvider)}
                  >
                    Assigner
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          {order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.COMPLETED && (
            <Card>
              <CardHeader>
                <CardTitle>Actions rapides</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {order.status === OrderStatus.PENDING && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate(OrderStatus.CONFIRMED)}
                  >
                    Confirmer la commande
                  </Button>
                )}
                {order.status === OrderStatus.CONFIRMED && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    loading={updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate(OrderStatus.IN_PROGRESS)}
                  >
                    Démarrer l'exécution
                  </Button>
                )}
                {order.status === OrderStatus.IN_PROGRESS && (
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    loading={updateStatusMutation.isPending}
                    onClick={() => updateStatusMutation.mutate(OrderStatus.COMPLETED)}
                  >
                    Marquer terminée
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
