import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, MapPin, Users, BedDouble, Bath, MoreHorizontal, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight, X, ExternalLink, Check, Download, Trash, Bug } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { VillaDto } from '@malodge/shared';
import { VillaForm } from './VillaForm';
import { VillaListView } from './VillaListView';
import { useCountries } from '../../hooks/useCountries';

function LodgifyDetailModal({ p, onClose }: { p: any; onClose: () => void }) {
  const [imgIdx, setImgIdx] = useState(0);
  const imgs: string[] = p.images?.length ? p.images : (p.coverImage ? [p.coverImage] : []);
  const prev = () => setImgIdx((i) => (i - 1 + imgs.length) % imgs.length);
  const next = () => setImgIdx((i) => (i + 1) % imgs.length);

  return (
    <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] bg-canvas rounded-2xl border border-line overflow-hidden flex flex-col"
      >
        {/* Gallery */}
        <div className="relative flex-shrink-0" style={{ height: '55%', minHeight: 300 }}>
          {imgs.length > 0 ? (
            <>
              <img
                key={imgIdx}
                src={imgs[imgIdx]}
                alt={p.name}
                className="w-full h-full object-cover"
                style={{ height: 360 }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-transparent pointer-events-none" style={{ height: 360 }} />

              {/* Navigation arrows */}
              {imgs.length > 1 && (<>
                <button onClick={prev}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm">
                  <ChevronLeft size={18} />
                </button>
                <button onClick={next}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm">
                  <ChevronRight size={18} />
                </button>
                <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-1.5">
                  {imgs.slice(0, 12).map((_: string, i: number) => (
                    <button key={i} onClick={() => setImgIdx(i)}
                      className={`rounded-full transition-all ${i === imgIdx ? 'w-4 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'}`} />
                  ))}
                </div>
              </>)}

              {/* Counter */}
              {imgs.length > 1 && (
                <span className="absolute top-4 right-14 text-xs text-white/70 bg-black/50 px-2 py-0.5 rounded-full backdrop-blur-sm">
                  {imgIdx + 1} / {imgs.length}
                </span>
              )}
            </>
          ) : (
            <div className="w-full flex items-center justify-center bg-surface-2" style={{ height: 360 }}>
              <Building2 size={56} className="text-line-strong" />
            </div>
          )}

          {/* Close button */}
          <button onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm">
            <X size={16} />
          </button>

          {/* Lodgify badge */}
          <div className="absolute top-4 left-4">
            <span className="px-2.5 py-1 rounded-full text-[11px] border border-accent/40 bg-accent/15 text-accent backdrop-blur-sm">
              🔗 Lodgify
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Left: main info */}
            <div className="md:col-span-2 space-y-5">
              <div>
                <h2 className="font-display font-semibold text-[24px] leading-tight text-ink">{p.name}</h2>
                {(p.city || p.country) && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-muted">
                    <MapPin size={13} />
                    <span>{[p.address, p.city, p.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>

              {p.description && (
                <div>
                  <h3 className="text-[12.5px] font-semibold text-muted mb-2">Description</h3>
                  <div
                    className="lodgify-description text-sm text-ink-soft leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: p.description }}
                  />
                </div>
              )}

              {/* Thumbnail strip */}
              {imgs.length > 1 && (
                <div>
                  <h3 className="text-[12.5px] font-semibold text-muted mb-2">Photos</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {imgs.map((src: string, i: number) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === imgIdx ? 'border-accent' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                        <img src={src} alt="" className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: stats card */}
            <div className="space-y-3">
              <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
                <h3 className="text-[12.5px] font-semibold text-muted">Caractéristiques</h3>
                {p.maxGuests && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted"><Users size={14} /><span>Voyageurs</span></div>
                    <span className="text-ink font-medium">{p.maxGuests}</span>
                  </div>
                )}
                {p.bedrooms && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted"><BedDouble size={14} /><span>Chambres</span></div>
                    <span className="text-ink font-medium">{p.bedrooms}</span>
                  </div>
                )}
                {p.bathrooms && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-muted"><Bath size={14} /><span>Salles de bain</span></div>
                    <span className="text-ink font-medium">{p.bathrooms}</span>
                  </div>
                )}
                {!p.maxGuests && !p.bedrooms && !p.bathrooms && (
                  <p className="text-[12px] text-muted">Non renseignées dans Lodgify.</p>
                )}
                {Object.values(p.capacitySource ?? {}).includes('description') && (
                  <p className="text-[11.5px] text-muted leading-snug">
                    Certains chiffres sont lus dans le texte de l’annonce, faute de champ rempli dans Lodgify.
                  </p>
                )}
              </div>

              {p.lodgifyUrl && (
                <a href={p.lodgifyUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-accent/30 text-accent text-sm hover:bg-accent/10 transition-colors">
                  <ExternalLink size={14} />
                  Voir sur Lodgify
                </a>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function LodgifyVillaCard({ p, isSaved, onSave, onSync, isSyncing, onClick }: {
  p: any; isSaved: boolean; onSave: () => void; onSync: () => void; isSyncing: boolean; onClick: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="rounded-xl border border-line bg-surface overflow-hidden flex flex-col h-full cursor-pointer hover:border-accent/30 transition-all duration-200"
    >
      <div className="aspect-video bg-surface-2 relative overflow-hidden">
        {p.coverImage ? (
          <img
            src={p.coverImage}
            alt={p.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={32} className="text-line-strong" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-0.5 rounded-full text-[10px] border border-accent/30 bg-accent/10 text-accent">Lodgify</span>
        </div>
        {/* Action buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Sync button — always visible, updates data in DB */}
          <button
            onClick={onSync}
            disabled={isSyncing}
            title="Synchroniser avec Lodgify"
            className="flex items-center p-1.5 rounded-lg bg-canvas/80 border border-line text-muted hover:text-accent hover:border-accent/40 transition-all backdrop-blur-sm disabled:opacity-40"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
          </button>
          {/* Save / saved indicator */}
          {isSaved ? (
            <span className="flex items-center p-1.5 rounded-lg bg-success/20 border border-success/40 text-success">
              <Check size={12} />
            </span>
          ) : (
            <button
              onClick={onSave}
              title="Sauvegarder en base"
              className="flex items-center p-1.5 rounded-lg bg-canvas/80 border border-line text-muted hover:text-accent hover:border-accent/40 transition-all backdrop-blur-sm"
            >
              <Download size={12} />
            </button>
          )}
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm font-medium text-ink truncate">{p.name}</h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-muted flex-1">
          <MapPin size={11} />
          <span>{[p.city, p.country].filter(Boolean).join(', ')}</span>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line">
          {p.maxGuests && <div className="flex items-center gap-1 text-xs text-muted"><Users size={11} /><span>{p.maxGuests}</span></div>}
          {p.bedrooms && <div className="flex items-center gap-1 text-xs text-muted"><BedDouble size={11} /><span>{p.bedrooms}</span></div>}
          {p.bathrooms && <div className="flex items-center gap-1 text-xs text-muted"><Bath size={11} /><span>{p.bathrooms}</span></div>}
        </div>
      </div>
    </motion.div>
  );
}

type ActiveFilter = '' | 'true' | 'false';

export function VillasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [source, setSource] = useState<'local' | 'lodgify'>('local');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [countryFilter, setCountryFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVilla, setEditingVilla] = useState<VillaDto | null>(null);
  const [selectedLodgify, setSelectedLodgify] = useState<any | null>(null);
  const [rawDebug, setRawDebug] = useState<any | null>(null);

  const rawDebugMutation = useMutation({
    mutationFn: () => apiClient.get('/lodgify/properties/raw'),
    onSuccess: (res) => setRawDebug(res.data?.data ?? res.data),
    onError: () => toast.error('Erreur debug raw'),
  });

  const { data: countriesData } = useCountries();
  const countries = countriesData ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['villas', { page, search, activeFilter, countryFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      if (activeFilter !== '') params.set('isActive', activeFilter);
      if (countryFilter) params.set('country', countryFilter);
      const res = await apiClient.get(`/villas?${params}`);
      return res.data.data || res.data;
    },
    staleTime: 30000,
  });

  const { data: lodgifyStatusData } = useQuery({
    queryKey: ['lodgify-status'],
    queryFn: async () => { const res = await apiClient.get('/lodgify/status'); return res.data?.data ?? res.data; },
    staleTime: 60_000,
  });
  const lodgifyConfigured = !!lodgifyStatusData?.configured;

  const { data: lodgifyPropsData, isLoading: lodgifyLoading, isError: lodgifyIsError, error: lodgifyError, refetch: refetchLodgify } = useQuery({
    queryKey: ['lodgify-properties'],
    queryFn: async () => {
      const res = await apiClient.get('/lodgify/properties');
      const raw = res.data?.data ?? res.data;
      return Array.isArray(raw) ? raw : (Array.isArray(raw?.items) ? raw.items : (Array.isArray(raw?.data) ? raw.data : []));
    },
    enabled: source === 'lodgify' && lodgifyConfigured,
    staleTime: 2 * 60_000,
    retry: false,
  });
  const lodgifyProperties: any[] = Array.isArray(lodgifyPropsData) ? lodgifyPropsData : [];
  const [lodgifyCountryFilter, setLodgifyCountryFilter] = useState('');
  const [lodgifySyncFilter, setLodgifySyncFilter] = useState<'all' | 'new' | 'saved'>('all');
  const lodgifyCountries = [...new Set(lodgifyProperties.map((p) => p.country).filter(Boolean))].sort();

  const { data: syncedIdsData, refetch: refetchSyncedIds } = useQuery({
    queryKey: ['lodgify-synced-ids'],
    queryFn: async () => {
      const res = await apiClient.get('/lodgify/properties/synced-ids');
      const raw = res.data?.data ?? res.data;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: source === 'lodgify' && lodgifyConfigured,
    staleTime: 30_000,
  });
  const syncedIds = new Set<string>(syncedIdsData ?? []);

  const savePropertyMutation = useMutation({
    mutationFn: (prop: any) => apiClient.post('/lodgify/properties/save', prop),
    onSuccess: (_, prop) => {
      toast.success(`"${prop.name}" ajouté aux logements internes`);
      refetchSyncedIds();
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
    onError: () => toast.error('Erreur lors de la sauvegarde'),
  });

  const syncPropertyMutation = useMutation({
    mutationFn: (prop: any) => apiClient.post('/lodgify/properties/save', prop),
    onSuccess: (_, prop) => {
      toast.success(`"${prop.name}" synchronisé`);
      setSyncingId(null);
      refetchSyncedIds();
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
    onError: () => { setSyncingId(null); toast.error('Erreur lors de la synchronisation'); },
  });

  const deleteAllVillasMutation = useMutation({
    mutationFn: () => apiClient.delete('/villas/all'),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      toast.success(`${d.deleted ?? 0} villa(s) supprimée(s) de la base`);
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  const saveAllMutation = useMutation({
    mutationFn: () => apiClient.post('/lodgify/properties/save-all', { properties: lodgifyProperties }),
    onSuccess: (res) => {
      const d = res.data?.data ?? res.data;
      toast.success(`Synchronisation : ${d.created} créé(s), ${d.updated} mis à jour`);
      refetchSyncedIds();
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
    onError: () => toast.error('Erreur lors de la synchronisation'),
  });

  const filteredLodgifyProperties = lodgifyProperties.filter((p) => {
    if (lodgifyCountryFilter && p.country !== lodgifyCountryFilter) return false;
    if (lodgifySyncFilter === 'new') return !syncedIds.has(p.id);
    if (lodgifySyncFilter === 'saved') return syncedIds.has(p.id);
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/villas/${id}`),
    onSuccess: () => {
      toast.success('Villa supprimée');
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
  });

  const handleEdit = (villa: VillaDto) => {
    setEditingVilla(villa);
    setModalOpen(true);
  };

  const handleDelete = (villa: VillaDto) => {
    if (confirm(`Supprimer "${villa.name}" ?`)) {
      deleteMutation.mutate(villa.id);
    }
  };

  const handleClose = () => {
    setModalOpen(false);
    setEditingVilla(null);
  };

  const villas: VillaDto[] = data?.data || data || [];
  const meta = data?.meta;

  const filterBtn = (label: string, value: ActiveFilter) => (
    <button
      onClick={() => { setActiveFilter(value); setPage(1); }}
      className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${
        activeFilter === value
          ? 'border-primary bg-primary text-on-primary'
          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader title="Villas" description={source === 'lodgify' ? `${lodgifyProperties.length} logements Lodgify` : `${meta?.total ?? villas.length} villas au total`}>
        {source === 'local' && (
          <div className="flex items-center gap-2">
            {isSuperAdmin && (
              <Button
                variant="destructive"
                size="sm"
                icon={<Trash size={13} />}
                loading={deleteAllVillasMutation.isPending}
                onClick={() => {
                  if (confirm('Supprimer TOUTES les villas de la base de données ?\n\nCette action est irréversible. Lodgify n\'est pas affecté.')) {
                    if (confirm('Confirmation finale : supprimer toutes les villas ?')) {
                      deleteAllVillasMutation.mutate();
                    }
                  }
                }}
              >
                Tout supprimer
              </Button>
            )}
            <Button
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => { setEditingVilla(null); setModalOpen(true); }}
            >
              Ajouter une villa
            </Button>
          </div>
        )}
      </PageHeader>

      {/* Source tabs — only useful when Lodgify is connected */}
      {(lodgifyConfigured || source === 'lodgify') && (
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSource('local')}
          className={`inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium border transition-all ${source === 'local' ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
        >
          Logements internes
        </button>
        {lodgifyConfigured && (
          <button
            onClick={() => setSource('lodgify')}
            className={`inline-flex items-center h-9 px-4 rounded-full text-[13px] font-medium border transition-all ${source === 'lodgify' ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}
          >
            🔗 Lodgify
          </button>
        )}
        {source === 'lodgify' && (
          <button onClick={() => { refetchLodgify().catch(() => {}); }} className="p-2 rounded-lg border border-line text-muted hover:text-ink hover:bg-surface transition-colors" title="Rafraîchir">
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      )}

      {/* Lodgify grid */}
      {source === 'lodgify' && (
        lodgifyLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : lodgifyIsError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 size={40} className="text-line-strong mb-4" />
            <p className="text-sm text-danger mb-1">Erreur Lodgify</p>
            <p className="text-xs text-muted max-w-md">{(lodgifyError as any)?.response?.data?.message ?? (lodgifyError as any)?.message ?? 'Impossible de contacter Lodgify'}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap items-center justify-between">
              <div className="flex gap-2 flex-wrap items-center">
                {/* Sync filter */}
                {(['all', 'new', 'saved'] as const).map((f) => (
                  <button key={f} onClick={() => setLodgifySyncFilter(f)}
                    className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${lodgifySyncFilter === f ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}>
                    {f === 'all' ? 'Tous' : f === 'new' ? 'Non pushés' : 'En base'}
                  </button>
                ))}
                {/* Country filter */}
                {lodgifyCountries.length > 1 && (<>
                  <span className="w-px h-4 bg-line" />
                  <button onClick={() => setLodgifyCountryFilter('')}
                    className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${!lodgifyCountryFilter ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}>
                    Tous les pays
                  </button>
                  {lodgifyCountries.map((c) => (
                    <button key={c} onClick={() => setLodgifyCountryFilter(c)}
                      className={`inline-flex items-center h-8 px-3.5 rounded-full text-[12.5px] font-medium border transition-all ${lodgifyCountryFilter === c ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink'}`}>
                      {c}
                    </button>
                  ))}
                </>)}
              </div>

              {/* Right-side actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={rawDebugMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Bug size={13} />}
                  onClick={() => rawDebugMutation.mutate()}
                  loading={rawDebugMutation.isPending}
                  disabled={rawDebugMutation.isPending}
                  title="Afficher les champs bruts Lodgify (debug)"
                >
                  Debug
                </Button>
                {lodgifyProperties.length > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={saveAllMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />}
                    onClick={() => saveAllMutation.mutate()}
                    loading={saveAllMutation.isPending}
                    disabled={saveAllMutation.isPending}
                  >
                    Tout synchroniser ({lodgifyProperties.length})
                  </Button>
                )}
              </div>
            </div>

            {filteredLodgifyProperties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Building2 size={40} className="text-line-strong mb-4" />
                <p className="text-muted">Aucun logement Lodgify</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                {filteredLodgifyProperties.map((p) => (
                  <LodgifyVillaCard
                    key={p.id}
                    p={p}
                    isSaved={syncedIds.has(p.id)}
                    onSave={() => savePropertyMutation.mutate(p)}
                    onSync={() => { setSyncingId(p.id); syncPropertyMutation.mutate(p); }}
                    isSyncing={syncingId === p.id}
                    onClick={() => setSelectedLodgify(p)}
                  />
                ))}
              </div>
            )}
          </>
        )
      )}

      {/* Filters (local only) */}
      {source === 'local' && (<>
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="max-w-xs w-full">
          <Input
            placeholder="Rechercher une villa..."
            leftIcon={<Search size={13} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {filterBtn('Toutes', '')}
          {filterBtn('Actives', 'true')}
          {filterBtn('Inactives', 'false')}
        </div>
        {countries.length > 0 && (
          <div className="flex gap-2 flex-wrap">
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

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6">
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}</div>
        </div>
      ) : villas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 size={40} className="text-line-strong mb-4" />
          <p className="text-muted">Aucune villa trouvée</p>
          <p className="text-xs text-muted mt-1">Ajoutez votre première villa pour commencer</p>
        </div>
      ) : (
        <VillaListView
          villas={villas}
          onOpen={(villa) => navigate(`/villas/${villa.id}`)}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Précédent
          </Button>
          <span className="flex items-center text-xs text-muted px-4">
            {page} / {meta.totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page === meta.totalPages} onClick={() => setPage(page + 1)}>
            Suivant
          </Button>
        </div>
      )}

      </>)}

      {selectedLodgify && <LodgifyDetailModal p={selectedLodgify} onClose={() => setSelectedLodgify(null)} />}

      {/* Raw debug modal */}
      {rawDebug && (
        <div className="fixed inset-0 !m-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setRawDebug(null)}>
          <div className="w-full max-w-3xl max-h-[85vh] bg-canvas rounded-2xl border border-line overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <div>
                <h2 className="text-sm font-semibold text-ink">Debug — Champs bruts Lodgify</h2>
                <p className="text-xs text-muted mt-0.5">{rawDebug.totalCount} propriété(s) · 1ère propriété ci-dessous</p>
              </div>
              <button onClick={() => setRawDebug(null)} className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-surface-2 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <h3 className="text-[12.5px] font-semibold text-muted mb-2">Champs disponibles</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(rawDebug.keys ?? []).map((k: string) => (
                    <span key={k} className="px-2 py-0.5 rounded text-[11px] font-mono bg-surface-2 border border-line text-accent">{k}</span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-[12.5px] font-semibold text-muted mb-2">Capacité retenue, sources et appels (lecture seule)</h3>
                <pre className="text-xs font-mono text-ink-soft bg-surface rounded-lg border border-line p-3 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(rawDebug.occupancyFields, null, 2)}
                </pre>
              </div>
              <div>
                <h3 className="text-[12.5px] font-semibold text-muted mb-2">Réponses Lodgify (liste, détail, types de chambre)</h3>
                <pre className="text-xs font-mono text-ink-soft bg-surface rounded-lg border border-line p-3 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(rawDebug.raw, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Form */}
      <Modal
        open={modalOpen}
        onClose={handleClose}
        title={editingVilla ? 'Modifier la villa' : 'Ajouter une villa'}
        description={editingVilla ? `Modifier les informations de ${editingVilla.name}` : 'Renseignez les informations de la nouvelle villa'}
        size="lg"
      >
        <VillaForm
          villa={editingVilla}
          onSuccess={handleClose}
        />
      </Modal>
    </div>
  );
}
