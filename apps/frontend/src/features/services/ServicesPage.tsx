import { useEffect, useMemo, useState } from 'react';
import { MadEquivalent } from '../../lib/fx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Sparkles, Pencil, Trash2, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { cn, formatMoney } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { ActivityGroup, groupActivities } from './variants';
import { ServiceDto } from '@malodge/shared';
import { ServiceForm } from './ServiceForm';

type CatalogueService = ServiceDto & { currency?: string };

function ActivityCard({
  group,
  onEdit,
  onDelete,
}: {
  group: ActivityGroup<CatalogueService>;
  onEdit: (s: CatalogueService) => void;
  onDelete: (s: CatalogueService) => void;
}) {
  const description = group.items.find((i) => i.description)?.description;
  const allInactive = group.items.every((i) => !i.isActive);
  return (
    <div className={cn('rounded-2xl border border-line bg-surface p-5 flex flex-col gap-4', allInactive && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-peach flex items-center justify-center shrink-0">
          <Sparkles size={16} className="text-accent" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold text-ink leading-snug">{group.name}</p>
          <p className="text-[12px] text-muted mt-0.5">
            {group.category}
            {group.items.length > 1 ? ` · ${group.items.length} variantes` : ''}
          </p>
        </div>
      </div>
      {description && <p className="text-[12.5px] text-muted leading-relaxed line-clamp-2 -mt-1">{description}</p>}
      <ul className="mt-auto divide-y divide-line rounded-xl border border-line">
        {group.items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 px-3 py-2">
            <span className={cn('flex-1 min-w-0 text-[12.5px] truncate', item.variant ? 'text-ink-soft' : 'text-muted')} title={item.name}>
              {item.variant || 'Tarif unique'}
              {!item.isActive && <span className="ml-1.5 text-[11px] font-semibold text-muted">(inactif)</span>}
            </span>
            <span className="text-[13px] font-bold text-ink tabular whitespace-nowrap text-right">
              {formatMoney(item.basePrice, item.currency ?? 'EUR')}
              <MadEquivalent amount={item.basePrice} currency={item.currency ?? 'EUR'} className="block text-[11px] font-normal text-muted" />
            </span>
            <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button type="button" onClick={() => onEdit(item)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-surface-2" aria-label={`Modifier ${item.name}`}>
                <Pencil size={13} />
              </button>
              <button type="button" onClick={() => onDelete(item)} className="w-7 h-7 rounded-full flex items-center justify-center text-muted hover:text-danger hover:bg-danger/10" aria-label={`Supprimer ${item.name}`}>
                <Trash2 size={13} />
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface CleanupReport {
  categories: { before: number; after: number; merges: { into: string; from: string[]; services: number }[]; renamed: { from: string; to: string }[] };
  services: { before: number; after: number; merges: { name: string; duplicates: number; ordersMoved: number }[] };
}

function CleanupModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [report, setReport] = useState<CleanupReport | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const r = await apiClient.post(`/extras/catalogue/cleanup?dryRun=${dryRun}`, {}, { timeout: 60_000 });
      const data = (r.data?.data ?? r.data) as CleanupReport;
      if (dryRun) setReport(data);
      else {
        toast.success(`Catalogue nettoyé : ${data.categories.after} catégories, ${data.services.after} prestations`);
        qc.invalidateQueries({ queryKey: ['services'] });
        qc.invalidateQueries({ queryKey: ['service-categories'] });
        qc.invalidateQueries({ queryKey: ['extras'] });
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (open) {
      setReport(null);
      run(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const nothing = report && !report.categories.merges.length && !report.categories.renamed.length && !report.services.merges.length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Nettoyer les doublons"
      description="Fusionne les catégories qui se recoupent et les prestations en double. Commandes, extras et prestataires suivent : rien n’est perdu."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {nothing ? 'Fermer' : 'Annuler'}
          </Button>
          {!nothing && (
            <Button loading={busy && !!report} disabled={!report} onClick={() => run(false)}>
              Appliquer
            </Button>
          )}
        </div>
      }
    >
      {!report ? (
        <p className="text-[13px] text-muted py-6 text-center">Analyse du catalogue…</p>
      ) : nothing ? (
        <p className="text-[13px] text-ink-soft py-6 text-center">Aucun doublon : le catalogue est propre.</p>
      ) : (
        <div className="space-y-4 text-[13px]">
          <p className="text-ink-soft">
            Catégories : <b className="text-ink">{report.categories.before} → {report.categories.after}</b> · Prestations :{' '}
            <b className="text-ink">{report.services.before} → {report.services.after}</b>
          </p>
          {report.categories.merges.length > 0 && (
            <ul className="rounded-xl border border-line divide-y divide-line">
              {report.categories.merges.map((m) => (
                <li key={m.into} className="px-4 py-2.5">
                  <b className="text-ink">{m.into}</b>
                  <span className="text-muted"> ← {m.from.join(', ')} ({m.services} prestation{m.services > 1 ? 's' : ''})</span>
                </li>
              ))}
            </ul>
          )}
          {report.services.merges.length > 0 && (
            <ul className="rounded-xl border border-line divide-y divide-line">
              {report.services.merges.map((m) => (
                <li key={m.name} className="px-4 py-2.5">
                  <b className="text-ink">{m.name}</b>
                  <span className="text-muted"> — {m.duplicates} doublon{m.duplicates > 1 ? 's' : ''} fusionné{m.duplicates > 1 ? 's' : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

export function ServicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['services', { search, categoryId }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '500' });
      if (search) params.set('search', search);
      if (categoryId) params.set('categoryId', categoryId);
      const res = await apiClient.get(`/services?${params}`);
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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/services/${id}`),
    onSuccess: () => {
      toast.success('Service supprimé');
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });

  const services: CatalogueService[] = data?.data || data || [];
  const categories = categoriesData?.data || categoriesData || [];
  const groups = useMemo(() => groupActivities(services), [services]);
  const usedCategories = categories.filter((c: any) => (c._count?.services ?? 1) > 0);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const [cleanupOpen, setCleanupOpen] = useState(false);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader
        title="Services"
        description={`${groups.length} activité${groups.length > 1 ? 's' : ''} · ${services.length} prestation${services.length > 1 ? 's' : ''} (variantes comprises)`}
      >
        {isAdmin && (
          <Button variant="secondary" icon={<Wand2 size={14} />} onClick={() => setCleanupOpen(true)}>
            Nettoyer les doublons
          </Button>
        )}
        <Button variant="primary" icon={<Plus size={14} />} onClick={() => { setEditingService(null); setSlideOpen(true); }}>
          Ajouter un service
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="max-w-xs w-full">
          <Input placeholder="Rechercher..." leftIcon={<Search size={13} />} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryId('')}
            className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${!categoryId ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
          >
            Tous
          </button>
          {usedCategories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => setCategoryId(cat.id)}
              className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${categoryId === cat.id ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
            >
              {cat.name}
              {cat._count?.services ? <span className="ml-1.5 opacity-60 tabular">{cat._count.services}</span> : null}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Sparkles size={40} className="text-line-strong mb-4" />
          <p className="text-muted">Aucun service trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 items-start">
          {groups.map((g) => (
            <ActivityCard
              key={g.key}
              group={g}
              onEdit={(s) => { setEditingService(s); setSlideOpen(true); }}
              onDelete={(s) => { if (confirm(`Supprimer « ${s.name} » ?`)) deleteMutation.mutate(s.id); }}
            />
          ))}
        </div>
      )}

      <CleanupModal open={cleanupOpen} onClose={() => setCleanupOpen(false)} />

      <Modal
        open={slideOpen}
        onClose={() => { setSlideOpen(false); setEditingService(null); }}
        title={editingService ? 'Modifier le service' : 'Ajouter un service'}
        size="lg"
      >
        <ServiceForm
          service={editingService}
          categories={categories}
          onSuccess={() => { setSlideOpen(false); setEditingService(null); }}
        />
      </Modal>
    </div>
  );
}
