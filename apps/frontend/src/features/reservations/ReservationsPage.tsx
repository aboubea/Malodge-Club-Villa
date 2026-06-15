import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { Input } from '../../components/ui/Input';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency, formatDate } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { useCountries } from '../../hooks/useCountries';

const STATUS_CONFIG: Record<string, { label: string; variant: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled' }> = {
  PENDING:   { label: 'En attente', variant: 'pending' },
  CONFIRMED: { label: 'Confirmée',  variant: 'confirmed' },
  ACTIVE:    { label: 'Active',     variant: 'active' },
  COMPLETED: { label: 'Terminée',   variant: 'completed' },
  CANCELLED: { label: 'Annulée',    variant: 'cancelled' },
};

const STATUS_TABS = ['', 'PENDING', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
const STATUS_LABELS: Record<string, string> = {
  '': 'Toutes', PENDING: 'En attente', CONFIRMED: 'Confirmées',
  ACTIVE: 'Actives', COMPLETED: 'Terminées', CANCELLED: 'Annulées',
};

const SELECT_CLS =
  'w-full h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm ' +
  'focus:outline-none focus:border-[#C9A96E]/60 focus:ring-1 focus:ring-[#C9A96E]/20 transition-all appearance-none';

interface Reservation {
  id: string;
  checkIn: string;
  checkOut: string;
  status: string;
  totalAmount: number;
  guests?: number;
  notes?: string;
  villa: { id: string; name: string; city: string };
  client: { id: string; firstName: string; lastName: string; email: string };
}

type FormMode = 'create' | 'edit';

interface FormState {
  villaId: string;
  clientId: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  totalAmount: string;
  status: string;
  notes: string;
}

function emptyForm(): FormState {
  return { villaId: '', clientId: '', checkIn: '', checkOut: '', guests: '2', totalAmount: '', status: 'PENDING', notes: '' };
}

function fromReservation(r: Reservation): FormState {
  return {
    villaId: r.villa.id,
    clientId: r.client.id,
    checkIn: r.checkIn.slice(0, 10),
    checkOut: r.checkOut.slice(0, 10),
    guests: String(r.guests ?? 1),
    totalAmount: String(r.totalAmount),
    status: r.status,
    notes: r.notes ?? '',
  };
}

function RowSkeleton() {
  return (
    <tr className="border-b border-[#242428]">
      {[150, 120, 160, 60, 80, 90, 70].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <Skeleton className={`h-3.5 w-${i === 0 ? 36 : i === 2 ? 40 : i === 5 ? 20 : 24} rounded`} style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

export function ReservationsPage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const canEdit = ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user?.role ?? '');

  const [statusFilter, setStatusFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: countriesData } = useCountries();
  const countries = countriesData ?? [];
  const [mode, setMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<Partial<FormState>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['reservations', { page, status: statusFilter, country: countryFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (statusFilter) params.set('status', statusFilter);
      if (countryFilter) params.set('country', countryFilter);
      const res = await apiClient.get(`/reservations?${params}`);
      return res.data.data ?? res.data;
    },
    placeholderData: (prev) => prev,
  });

  const { data: villasData } = useQuery({
    queryKey: ['villas-select'],
    queryFn: async () => {
      const res = await apiClient.get('/villas?limit=100&isActive=true');
      return res.data.data ?? res.data;
    },
    enabled: modalOpen,
    staleTime: 60_000,
  });

  const { data: clientsData } = useQuery({
    queryKey: ['clients-select'],
    queryFn: async () => {
      const res = await apiClient.get('/users?role=CLIENT&limit=200');
      return res.data.data ?? res.data;
    },
    enabled: modalOpen,
    staleTime: 60_000,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: object) => {
      if (mode === 'edit' && editingId) return apiClient.patch(`/reservations/${editingId}`, payload);
      return apiClient.post('/reservations', payload);
    },
    onSuccess: () => {
      toast.success(mode === 'edit' ? 'Réservation modifiée' : 'Réservation créée');
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      closeModal();
    },
    onError: () => toast.error('Une erreur est survenue'),
  });

  const reservations: Reservation[] = data?.data ?? data ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, totalPages: 1 };

  const villas: any[] = villasData?.data ?? villasData ?? [];
  const clients: any[] = clientsData?.data ?? clientsData ?? [];

  function openCreate() {
    setMode('create');
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    setModalOpen(true);
  }

  function openEdit(r: Reservation) {
    setMode('edit');
    setEditingId(r.id);
    setForm(fromReservation(r));
    setErrors({});
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setErrors({});
  }

  function set(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((p) => ({ ...p, [field]: e.target.value }));
      if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
    };
  }

  function validate() {
    const e: Partial<FormState> = {};
    if (mode === 'create') {
      if (!form.villaId) e.villaId = 'Villa requise';
      if (!form.clientId) e.clientId = 'Client requis';
    }
    if (!form.checkIn) e.checkIn = 'Date requise';
    if (!form.checkOut) e.checkOut = 'Date requise';
    if (form.checkIn && form.checkOut && form.checkIn >= form.checkOut)
      e.checkOut = 'Doit être après le check-in';
    if (!form.totalAmount || isNaN(Number(form.totalAmount))) e.totalAmount = 'Montant requis';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const payload: any = {
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      guests: form.guests ? Number(form.guests) : undefined,
      totalAmount: Number(form.totalAmount),
      notes: form.notes || undefined,
    };
    if (mode === 'create') {
      payload.villaId = form.villaId;
      payload.clientId = form.clientId;
    }
    if (mode === 'edit') {
      payload.status = form.status;
    }
    saveMutation.mutate(payload);
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Réservations"
        description={`${meta.total} réservation${meta.total !== 1 ? 's' : ''} au total`}
      >
        {canEdit && (
          <Button variant="primary" icon={<Plus size={14} />} onClick={openCreate}>
            Nouvelle réservation
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                statusFilter === s
                  ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]'
                  : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'
              }`}
            >
              {STATUS_LABELS[s]}
            </button>
          ))}
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

      {/* Table */}
      <div className="rounded-xl border border-[#242428] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#242428] bg-[#111113]">
                {['Client', 'Villa', 'Séjour', 'Voyageurs', 'Statut', 'Montant', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-medium text-[#6B6B6F] uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} />)
                : reservations.length === 0
                ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <CalendarDays size={32} className="text-[#242428] mx-auto mb-3" />
                      <p className="text-sm text-[#6B6B6F]">Aucune réservation trouvée</p>
                    </td>
                  </tr>
                )
                : reservations.map((r, idx) => {
                  const sc = STATUS_CONFIG[r.status] ?? { label: r.status, variant: 'default' as const };
                  return (
                    <motion.tr
                      key={r.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      className="border-b border-[#242428] hover:bg-[#111113] transition-colors"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar firstName={r.client.firstName} lastName={r.client.lastName} size="sm" />
                          <div className="min-w-0">
                            <p className="text-[#F5F0EB] font-light truncate max-w-[140px]">
                              {r.client.firstName} {r.client.lastName}
                            </p>
                            <p className="text-[11px] text-[#6B6B6F] truncate max-w-[140px]">{r.client.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="text-[#F5F0EB] font-light truncate max-w-[140px]">{r.villa.name}</p>
                        <p className="text-[11px] text-[#6B6B6F]">{r.villa.city}</p>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-[#6B6B6F] text-xs">
                        {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                      </td>
                      <td className="px-4 py-3.5 text-center text-[#6B6B6F] text-sm">
                        {r.guests ?? '—'}
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge variant={sc.variant}>{sc.label}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-[#C9A96E] font-light whitespace-nowrap">
                        {formatCurrency(r.totalAmount)}
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(r)}
                            className="text-xs text-[#6B6B6F] hover:text-[#C9A96E] transition-colors px-2 py-1 rounded hover:bg-[#C9A96E]/10"
                          >
                            Modifier
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              }
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#242428] bg-[#111113]">
            <p className="text-xs text-[#6B6B6F]">
              Page {meta.page} sur {meta.totalPages} ({meta.total} au total)
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded text-[#6B6B6F] hover:text-[#F5F0EB] disabled:opacity-30 hover:bg-[#242428] transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page >= meta.totalPages}
                className="p-1.5 rounded text-[#6B6B6F] hover:text-[#F5F0EB] disabled:opacity-30 hover:bg-[#242428] transition-all"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={mode === 'edit' ? 'Modifier la réservation' : 'Nouvelle réservation'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeModal}>Annuler</Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Enregistrement…' : mode === 'edit' ? 'Enregistrer' : 'Créer'}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'create' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Villa *</label>
                  <select value={form.villaId} onChange={set('villaId')} className={SELECT_CLS}>
                    <option value="">Sélectionner une villa</option>
                    {villas.map((v: any) => (
                      <option key={v.id} value={v.id}>{v.name} — {v.city}</option>
                    ))}
                  </select>
                  {errors.villaId && <p className="text-xs text-red-400">{errors.villaId}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Client *</label>
                  <select value={form.clientId} onChange={set('clientId')} className={SELECT_CLS}>
                    <option value="">Sélectionner un client</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.firstName} {c.lastName} ({c.email})</option>
                    ))}
                  </select>
                  {errors.clientId && <p className="text-xs text-red-400">{errors.clientId}</p>}
                </div>
              </div>
              <div className="border-t border-[#242428]" />
            </>
          )}

          {mode === 'edit' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Statut</label>
              <select value={form.status} onChange={set('status')} className={SELECT_CLS}>
                {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                  <option key={val} value={val}>{cfg.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Check-in *"
              type="date"
              value={form.checkIn}
              onChange={set('checkIn')}
              error={errors.checkIn}
            />
            <Input
              label="Check-out *"
              type="date"
              value={form.checkOut}
              onChange={set('checkOut')}
              error={errors.checkOut}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Voyageurs"
              type="number"
              min="1"
              value={form.guests}
              onChange={set('guests')}
            />
            <Input
              label="Montant total (€) *"
              type="number"
              min="0"
              step="0.01"
              value={form.totalAmount}
              onChange={set('totalAmount')}
              error={errors.totalAmount}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Notes</label>
            <textarea
              className="w-full px-3 py-2.5 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/60 focus:ring-1 focus:ring-[#C9A96E]/20 transition-all resize-none"
              rows={3}
              placeholder="Informations complémentaires..."
              value={form.notes}
              onChange={set('notes')}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
