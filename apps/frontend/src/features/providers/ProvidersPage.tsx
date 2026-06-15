import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Briefcase, Building2, Tag, CheckCircle2, XCircle, Phone, Mail, CreditCard, Hash, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { DataTable, Column } from '../../components/ui/DataTable';
import { apiClient } from '../../lib/apiClient';
import { formatDate } from '../../lib/utils';
import { useCountries } from '../../hooks/useCountries';

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Provider {
  id: string;
  companyName?: string;
  siret?: string;
  iban?: string;
  isActive: boolean;
  createdAt: string;
  user: { id: string; firstName: string; lastName: string; email: string; phone?: string; avatar?: string };
  categories: { category: Category }[];
}

const EMPTY_INVITE = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  companyName: '',
  siret: '',
  iban: '',
  categoryIds: [] as string[],
  countries: [] as string[],
};

const EMPTY_EDIT = {
  companyName: '',
  siret: '',
  iban: '',
  isActive: true,
  categoryIds: [] as string[],
};

export function ProvidersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [detailProvider, setDetailProvider] = useState<Provider | null>(null);
  const [inviteForm, setInviteForm] = useState({ ...EMPTY_INVITE });
  const [editForm, setEditForm] = useState({ ...EMPTY_EDIT });
  const { data: allCountries = [] } = useCountries();

  const { data, isLoading } = useQuery({
    queryKey: ['providers', { page, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '15' });
      if (search) params.set('search', search);
      const res = await apiClient.get(`/providers?${params}`);
      return res.data.data || res.data;
    },
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const res = await apiClient.get('/service-categories');
      return res.data.data || res.data;
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (form: typeof EMPTY_INVITE) => apiClient.post('/providers/invite', form),
    onSuccess: () => {
      toast.success('Prestataire invité avec succès');
      qc.invalidateQueries({ queryKey: ['providers'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erreur lors de la création');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: string; form: typeof EMPTY_EDIT }) =>
      apiClient.patch(`/providers/${id}`, form),
    onSuccess: () => {
      toast.success('Prestataire mis à jour');
      qc.invalidateQueries({ queryKey: ['providers'] });
      closeModal();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Erreur lors de la mise à jour');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiClient.patch(`/providers/${id}`, { isActive }),
    onSuccess: () => {
      toast.success('Statut mis à jour');
      qc.invalidateQueries({ queryKey: ['providers'] });
    },
  });

  const openAdd = () => {
    setEditingProvider(null);
    setInviteForm({ ...EMPTY_INVITE });
    setModalOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setEditingProvider(provider);
    setEditForm({
      companyName: provider.companyName || '',
      siret: provider.siret || '',
      iban: provider.iban || '',
      isActive: provider.isActive,
      categoryIds: provider.categories.map((c) => c.category.id),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProvider(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProvider) {
      updateMutation.mutate({ id: editingProvider.id, form: editForm });
    } else {
      inviteMutation.mutate(inviteForm);
    }
  };

  const toggleCategory = (categoryId: string, isEditing: boolean) => {
    if (isEditing) {
      setEditForm((p) => ({
        ...p,
        categoryIds: p.categoryIds.includes(categoryId)
          ? p.categoryIds.filter((id) => id !== categoryId)
          : [...p.categoryIds, categoryId],
      }));
    } else {
      setInviteForm((p) => ({
        ...p,
        categoryIds: p.categoryIds.includes(categoryId)
          ? p.categoryIds.filter((id) => id !== categoryId)
          : [...p.categoryIds, categoryId],
      }));
    }
  };

  const toggleInviteCountry = (code: string) => {
    setInviteForm((p) => ({
      ...p,
      countries: p.countries.includes(code)
        ? p.countries.filter((c) => c !== code)
        : [...p.countries, code],
    }));
  };

  const categories: Category[] = categoriesData?.data || categoriesData || [];
  const providers: Provider[] = data?.data || data || [];
  const meta = data?.meta;

  const selectedCategoryIds = editingProvider ? editForm.categoryIds : inviteForm.categoryIds;

  const columns: Column<Provider>[] = [
    {
      key: 'user',
      header: 'Prestataire',
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar firstName={row.user.firstName} lastName={row.user.lastName} src={row.user.avatar} size="sm" />
          <div>
            <p className="text-sm text-[#F5F0EB]">{row.user.firstName} {row.user.lastName}</p>
            <p className="text-xs text-[#6B6B6F]">{row.user.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'company',
      header: 'Société',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row.companyName ? (
            <>
              <Building2 size={12} className="text-[#6B6B6F] shrink-0" />
              <span className="text-sm text-[#F5F0EB]">{row.companyName}</span>
            </>
          ) : (
            <span className="text-xs text-[#3A3A3E] italic">Individuel</span>
          )}
        </div>
      ),
    },
    {
      key: 'categories',
      header: 'Spécialités',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.categories.length === 0 ? (
            <span className="text-xs text-[#3A3A3E] italic">Aucune</span>
          ) : (
            row.categories.slice(0, 3).map((c) => (
              <Badge key={c.category.id} variant="default" className="text-[10px] py-0">
                {c.category.name}
              </Badge>
            ))
          )}
          {row.categories.length > 3 && (
            <Badge variant="default" className="text-[10px] py-0">+{row.categories.length - 3}</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.isActive ? 'active' : 'inactive'}>
            {row.isActive ? 'Actif' : 'Inactif'}
          </Badge>
          <button
            onClick={(e) => { e.stopPropagation(); toggleActiveMutation.mutate({ id: row.id, isActive: !row.isActive }); }}
            className="text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors"
            title={row.isActive ? 'Désactiver' : 'Activer'}
          >
            {row.isActive ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
          </button>
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Ajouté le',
      render: (row) => <span className="text-xs text-[#6B6B6F]">{formatDate(row.createdAt)}</span>,
    },
  ];

  const isPending = inviteMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageHeader
        title="Prestataires"
        description={`${meta?.total ?? providers.length} prestataires`}
      >
        <Button variant="primary" icon={<Plus size={14} />} onClick={openAdd}>
          Ajouter un prestataire
        </Button>
      </PageHeader>

      {/* Search */}
      <div className="max-w-xs">
        <Input
          placeholder="Rechercher..."
          leftIcon={<Search size={13} />}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      <DataTable
        columns={columns}
        data={providers}
        loading={isLoading}
        onEdit={openEdit}
        onRowClick={(row) => setDetailProvider(row)}
        emptyMessage="Aucun prestataire trouvé"
        pagination={meta ? { page, totalPages: meta.totalPages, onPageChange: setPage } : undefined}
      />

      {/* Provider Detail Popup */}
      <Modal
        open={!!detailProvider}
        onClose={() => setDetailProvider(null)}
        title="Fiche prestataire"
        size="lg"
      >
        {detailProvider && (
          <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center gap-4">
              <Avatar
                firstName={detailProvider.user.firstName}
                lastName={detailProvider.user.lastName}
                src={detailProvider.user.avatar}
                size="lg"
              />
              <div>
                <h3 className="text-base font-medium text-[#F5F0EB]">
                  {detailProvider.user.firstName} {detailProvider.user.lastName}
                </h3>
                {detailProvider.companyName && (
                  <p className="text-sm text-[#6B6B6F] flex items-center gap-1.5 mt-0.5">
                    <Building2 size={12} /> {detailProvider.companyName}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant={detailProvider.isActive ? 'active' : 'inactive'}>
                    {detailProvider.isActive ? 'Actif' : 'Inactif'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-[#111113] border border-[#242428]">
                <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider mb-1 flex items-center gap-1"><Mail size={10} /> Email</p>
                <p className="text-sm text-[#F5F0EB]">{detailProvider.user.email}</p>
              </div>
              {detailProvider.user.phone && (
                <div className="p-3 rounded-lg bg-[#111113] border border-[#242428]">
                  <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider mb-1 flex items-center gap-1"><Phone size={10} /> Téléphone</p>
                  <p className="text-sm text-[#F5F0EB]">{detailProvider.user.phone}</p>
                </div>
              )}
              {detailProvider.siret && (
                <div className="p-3 rounded-lg bg-[#111113] border border-[#242428]">
                  <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider mb-1 flex items-center gap-1"><Hash size={10} /> SIRET</p>
                  <p className="text-sm font-mono text-[#F5F0EB]">{detailProvider.siret}</p>
                </div>
              )}
              {detailProvider.iban && (
                <div className="p-3 rounded-lg bg-[#111113] border border-[#242428]">
                  <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider mb-1 flex items-center gap-1"><CreditCard size={10} /> IBAN</p>
                  <p className="text-sm font-mono text-[#F5F0EB]">{detailProvider.iban}</p>
                </div>
              )}
            </div>

            {/* Specialties */}
            {detailProvider.categories.length > 0 && (
              <div>
                <p className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider mb-2 flex items-center gap-1.5"><Tag size={11} /> Spécialités</p>
                <div className="flex flex-wrap gap-2">
                  {detailProvider.categories.map((c) => (
                    <Badge key={c.category.id} variant="default">{c.category.name}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-[#242428]">
              <p className="text-xs text-[#6B6B6F]">Membre depuis {formatDate(detailProvider.createdAt)}</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setDetailProvider(null); openEdit(detailProvider); }}
              >
                Modifier
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Add / Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingProvider ? 'Modifier le prestataire' : 'Ajouter un prestataire'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* User section — only when creating */}
          {!editingProvider && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[#C9A96E]/20 text-[#C9A96E] text-[10px] flex items-center justify-center font-bold">1</span>
                Informations personnelles
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Prénom"
                  value={inviteForm.firstName}
                  onChange={(e) => setInviteForm((p) => ({ ...p, firstName: e.target.value }))}
                  required
                />
                <Input
                  label="Nom"
                  value={inviteForm.lastName}
                  onChange={(e) => setInviteForm((p) => ({ ...p, lastName: e.target.value }))}
                  required
                />
              </div>
              <Input
                label="Email"
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
              <Input
                label="Téléphone"
                type="tel"
                value={inviteForm.phone}
                onChange={(e) => setInviteForm((p) => ({ ...p, phone: e.target.value }))}
              />
              <div className="border-t border-[#242428]" />
            </div>
          )}

          {/* Provider info */}
          <div className="space-y-4">
            {!editingProvider && (
              <p className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[#C9A96E]/20 text-[#C9A96E] text-[10px] flex items-center justify-center font-bold">2</span>
                Informations professionnelles
              </p>
            )}
            <Input
              label="Nom de société"
              placeholder="Entreprise SAS"
              value={editingProvider ? editForm.companyName : inviteForm.companyName}
              onChange={(e) =>
                editingProvider
                  ? setEditForm((p) => ({ ...p, companyName: e.target.value }))
                  : setInviteForm((p) => ({ ...p, companyName: e.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="SIRET"
                placeholder="12345678901234"
                value={editingProvider ? editForm.siret : inviteForm.siret}
                onChange={(e) =>
                  editingProvider
                    ? setEditForm((p) => ({ ...p, siret: e.target.value }))
                    : setInviteForm((p) => ({ ...p, siret: e.target.value }))
                }
              />
              <Input
                label="IBAN"
                placeholder="FR76..."
                value={editingProvider ? editForm.iban : inviteForm.iban}
                onChange={(e) =>
                  editingProvider
                    ? setEditForm((p) => ({ ...p, iban: e.target.value }))
                    : setInviteForm((p) => ({ ...p, iban: e.target.value }))
                }
              />
            </div>
            {editingProvider && (
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm((p) => ({ ...p, isActive: e.target.checked }))}
                  className="w-4 h-4 rounded border border-[#242428] bg-[#1A1A1D] accent-[#C9A96E]"
                />
                <span className="text-sm text-[#F5F0EB]">Prestataire actif</span>
              </label>
            )}
          </div>

          {/* Categories */}
          {categories.length > 0 && (
            <div className="space-y-3">
              <div className="border-t border-[#242428]" />
              <p className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider flex items-center gap-2">
                <Tag size={11} />
                Spécialités
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat: Category) => {
                  const selected = selectedCategoryIds.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => toggleCategory(cat.id, !!editingProvider)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                        selected
                          ? 'border-[#C9A96E]/50 bg-[#C9A96E]/10 text-[#C9A96E]'
                          : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB] hover:border-[#3A3A3E]'
                      }`}
                    >
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Countries — invite only */}
          {!editingProvider && allCountries.length > 0 && (
            <div className="space-y-3">
              <div className="border-t border-[#242428]" />
              <p className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider flex items-center gap-2">
                <Globe size={11} />
                Pays d'intervention
              </p>
              <div className="flex flex-wrap gap-2">
                {allCountries.map((country) => {
                  const selected = inviteForm.countries.includes(country.code);
                  return (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => toggleInviteCountry(country.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs border transition-all flex items-center gap-1.5 ${
                        selected
                          ? 'border-[#C9A96E]/50 bg-[#C9A96E]/10 text-[#C9A96E]'
                          : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB] hover:border-[#3A3A3E]'
                      }`}
                    >
                      <span>{country.flag}</span>
                      <span>{country.name}</span>
                    </button>
                  );
                })}
              </div>
              {inviteForm.countries.length === 0 && (
                <p className="text-[10px] text-[#3A3A3E]">Aucun pays sélectionné — disponible partout</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={closeModal}>
              Annuler
            </Button>
            <Button type="submit" variant="primary" loading={isPending} className="flex-1">
              {editingProvider ? 'Enregistrer' : 'Créer le prestataire'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
