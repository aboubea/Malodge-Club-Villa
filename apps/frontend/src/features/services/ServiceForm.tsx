import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, X, UserCheck, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { apiClient } from '../../lib/apiClient';
import { ServiceDto, ServiceCategoryDto } from '@malodge/shared';

interface ServiceFormProps {
  service?: ServiceDto | null;
  categories: ServiceCategoryDto[];
  onSuccess: () => void;
}

export function ServiceForm({ service, categories, onSuccess }: ServiceFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: service?.name || '',
    description: service?.description || '',
    basePrice: service?.basePrice || 0,
    currency: (service as { currency?: string } | null | undefined)?.currency || 'EUR',
    duration: service?.duration || '',
    categoryId: service?.categoryId || (categories[0]?.id || ''),
    requiresDate: service?.requiresDate || false,
    requiresTime: service?.requiresTime || false,
    isActive: service?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [providerSearch, setProviderSearch] = useState('');
  const [showProviderSearch, setShowProviderSearch] = useState(false);

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        duration: data.duration !== '' ? Number(data.duration) : undefined,
      };
      if (service) return apiClient.patch(`/services/${service.id}`, payload);
      return apiClient.post('/services', payload);
    },
    onSuccess: () => {
      toast.success(service ? 'Service modifié' : 'Service créé');
      qc.invalidateQueries({ queryKey: ['services'] });
      onSuccess();
    },
  });

  // Providers currently assigned to this service
  const { data: serviceDetail, refetch: refetchDetail } = useQuery({
    queryKey: ['service-detail', service?.id],
    queryFn: async () => {
      const res = await apiClient.get(`/services/${service!.id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!service?.id,
  });
  const assignedProviders: any[] = serviceDetail?.providers ?? [];

  // All providers for search
  const { data: allProvidersData } = useQuery({
    queryKey: ['providers-search', providerSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '30' });
      if (providerSearch) params.set('search', providerSearch);
      const res = await apiClient.get(`/providers?${params}`);
      return (res.data.data ?? res.data)?.data ?? [];
    },
    enabled: showProviderSearch,
  });
  const allProviders: any[] = allProvidersData ?? [];
  const assignedIds = new Set(assignedProviders.map((p: any) => p.providerId));

  const assignMutation = useMutation({
    mutationFn: ({ providerId, isPreferred }: { providerId: string; isPreferred?: boolean }) =>
      apiClient.post(`/services/${service!.id}/providers`, { providerId, isPreferred }),
    onSuccess: () => {
      toast.success('Prestataire assigné');
      refetchDetail();
      qc.invalidateQueries({ queryKey: ['services'] });
    },
    onError: () => toast.error('Erreur lors de l\'assignation'),
  });

  const removeMutation = useMutation({
    mutationFn: (providerId: string) =>
      apiClient.delete(`/services/${service!.id}/providers/${providerId}`),
    onSuccess: () => {
      toast.success('Prestataire retiré');
      refetchDetail();
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name) e.name = 'Nom requis';
    if (!form.basePrice || form.basePrice <= 0) e.basePrice = 'Prix requis';
    if (!form.categoryId) e.categoryId = 'Catégorie requise';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Nom du service"
        placeholder="Spa & Massage"
        value={form.name}
        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
        error={errors.name}
      />

      <div>
        <label className="text-[12.5px] font-medium text-ink-soft">Description</label>
        <textarea
          className="w-full mt-1.5 px-3 py-2.5 rounded-xl bg-surface border border-line text-ink text-sm placeholder:text-muted focus:outline-none focus:border-ink/25 focus:ring-4 focus:ring-ink/5 resize-none"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Description du service..."
        />
      </div>

      <div>
        <label className="text-[12.5px] font-medium text-ink-soft">Catégorie</label>
        <select
          className="w-full mt-1.5 h-10 px-3 rounded-xl bg-surface border border-line text-ink text-sm focus:outline-none focus:border-ink/25 focus:ring-4 focus:ring-ink/5"
          value={form.categoryId}
          onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        {errors.categoryId && <p className="text-xs text-danger mt-1">{errors.categoryId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={`Prix de base (${form.currency})`}
          type="number"
          min="0"
          step="0.01"
          value={String(form.basePrice)}
          onChange={(e) => setForm((p) => ({ ...p, basePrice: Number(e.target.value) }))}
          error={errors.basePrice}
        />
        <div>
          <label className="text-[12.5px] font-medium text-ink-soft">Devise</label>
          <select
            value={form.currency}
            onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
            className="mt-1.5 w-full h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          >
            <option value="EUR">Euro (EUR)</option>
            <option value="MAD">Dirham (MAD)</option>
          </select>
        </div>
        <Input
          label="Durée (min)"
          type="number"
          min="0"
          value={String(form.duration)}
          onChange={(e) => setForm((p) => ({ ...p, duration: e.target.value }))}
          hint="Optionnel"
        />
      </div>

      <div className="space-y-2">
        {[
          { key: 'requiresDate', label: 'Nécessite une date' },
          { key: 'requiresTime', label: 'Nécessite une heure' },
          { key: 'isActive', label: 'Service actif' },
        ].map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={(form as any)[key]}
              onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.checked }))}
              className="w-4 h-4 rounded border border-line bg-surface accent-accent"
            />
            <span className="text-sm text-ink">{label}</span>
          </label>
        ))}
      </div>

      {/* Providers section — editing only */}
      {service && (
        <div className="border-t border-line pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-semibold text-muted flex items-center gap-1.5">
              <UserCheck size={11} /> Prestataires assignés
            </p>
            <button
              type="button"
              onClick={() => setShowProviderSearch((v) => !v)}
              className="text-xs text-accent hover:underline"
            >
              {showProviderSearch ? 'Fermer' : '+ Ajouter'}
            </button>
          </div>

          {/* Assigned providers list */}
          {assignedProviders.length === 0 ? (
            <p className="text-xs text-muted italic">Aucun prestataire assigné</p>
          ) : (
            <div className="space-y-2">
              {assignedProviders.map((sp: any) => (
                <div key={sp.providerId} className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-surface border border-line">
                  <Avatar
                    firstName={sp.provider?.user?.firstName}
                    lastName={sp.provider?.user?.lastName}
                    size="xs"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-ink font-medium">
                      {sp.provider?.user?.firstName} {sp.provider?.user?.lastName}
                    </p>
                    {sp.provider?.companyName && (
                      <p className="text-[10px] text-muted">{sp.provider.companyName}</p>
                    )}
                  </div>
                  {sp.isPreferred && (
                    <span title="Prestataire préféré">
                      <Star size={11} className="text-accent fill-accent" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => assignMutation.mutate({ providerId: sp.providerId, isPreferred: !sp.isPreferred })}
                    className="p-1 text-muted hover:text-accent transition-colors"
                    title={sp.isPreferred ? 'Retirer préféré' : 'Marquer préféré'}
                  >
                    <Star size={11} className={sp.isPreferred ? '' : 'opacity-40'} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(sp.providerId)}
                    className="p-1 text-muted hover:text-danger transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Provider search + add */}
          {showProviderSearch && (
            <div className="space-y-2">
              <Input
                placeholder="Rechercher un prestataire..."
                leftIcon={<Search size={12} />}
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
              />
              <div className="space-y-1 max-h-44 overflow-y-auto">
                {allProviders
                  .filter((p: any) => !assignedIds.has(p.id))
                  .map((p: any) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2.5 py-2 px-3 rounded-lg bg-canvas border border-line hover:border-accent/20 transition-colors"
                    >
                      <Avatar firstName={p.user?.firstName} lastName={p.user?.lastName} size="xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-ink">
                          {p.user?.firstName} {p.user?.lastName}
                        </p>
                        {p.companyName && <p className="text-[10px] text-muted">{p.companyName}</p>}
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {p.categories?.slice(0, 2).map((c: any) => (
                            <span key={c.category?.id} className="text-[9px] text-muted px-1 py-0.5 bg-surface-2 rounded">
                              {c.category?.name}
                            </span>
                          ))}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        loading={assignMutation.isPending}
                        onClick={() => assignMutation.mutate({ providerId: p.id })}
                      >
                        Assigner
                      </Button>
                    </div>
                  ))}
                {allProviders.filter((p: any) => !assignedIds.has(p.id)).length === 0 && (
                  <p className="text-xs text-muted text-center py-3">Aucun prestataire disponible</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <Button type="submit" variant="primary" loading={mutation.isPending} className="w-full">
        {service ? 'Enregistrer' : 'Créer le service'}
      </Button>
    </form>
  );
}
