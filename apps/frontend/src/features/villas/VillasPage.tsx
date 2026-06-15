import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, MapPin, Users, BedDouble, Bath, MoreHorizontal, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight, X, ExternalLink, Check, Download } from 'lucide-react';
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
import { useCountries } from '../../hooks/useCountries';

function VillaCard({ villa, onEdit, onDelete, onClick }: {
  villa: VillaDto;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative rounded-xl border border-[#242428] bg-[#111113] overflow-hidden hover:border-[#C9A96E]/30 transition-all duration-200 cursor-pointer flex flex-col h-full"
      onClick={onClick}
    >
      {/* Image */}
      <div className="aspect-video bg-[#1A1A1D] relative overflow-hidden">
        {villa.coverImage ? (
          <img src={villa.coverImage} alt={villa.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={32} className="text-[#242428]" />
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-3 left-3">
          <Badge variant={villa.isActive ? 'active' : 'inactive'}>
            {villa.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        {/* Menu */}
        <div
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-7 h-7 rounded-lg bg-[#0A0A0B]/80 flex items-center justify-center text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen && (
              <div
                className="absolute right-0 top-8 w-36 bg-[#111113] border border-[#242428] rounded-lg shadow-xl z-10 py-1"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button
                  onClick={() => { setMenuOpen(false); onEdit(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#1A1A1D] transition-colors"
                >
                  <Pencil size={12} /> Modifier
                </button>
                <button
                  onClick={() => { setMenuOpen(false); onDelete(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-900/20 transition-colors"
                >
                  <Trash2 size={12} /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm font-medium text-[#F5F0EB] truncate">{villa.name}</h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-[#6B6B6F] flex-1">
          <MapPin size={11} />
          <span>{villa.city}, {villa.country}</span>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#242428]">
          <div className="flex items-center gap-1 text-xs text-[#6B6B6F]">
            <Users size={11} />
            <span>{villa.maxGuests}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-[#6B6B6F]">
            <BedDouble size={11} />
            <span>{villa.bedrooms}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-[#6B6B6F]">
            <Bath size={11} />
            <span>{villa.bathrooms}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function LodgifyDetailModal({ p, onClose }: { p: any; onClose: () => void }) {
  const [imgIdx, setImgIdx] = useState(0);
  const imgs: string[] = p.images?.length ? p.images : (p.coverImage ? [p.coverImage] : []);
  const prev = () => setImgIdx((i) => (i - 1 + imgs.length) % imgs.length);
  const next = () => setImgIdx((i) => (i + 1) % imgs.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] bg-[#0A0A0B] rounded-2xl border border-[#242428] overflow-hidden flex flex-col"
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
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-transparent to-transparent pointer-events-none" style={{ height: 360 }} />

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
            <div className="w-full flex items-center justify-center bg-[#1A1A1D]" style={{ height: 360 }}>
              <Building2 size={56} className="text-[#242428]" />
            </div>
          )}

          {/* Close button */}
          <button onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 flex items-center justify-center text-white transition-colors backdrop-blur-sm">
            <X size={16} />
          </button>

          {/* Lodgify badge */}
          <div className="absolute top-4 left-4">
            <span className="px-2.5 py-1 rounded-full text-[11px] border border-[#C9A96E]/40 bg-[#C9A96E]/15 text-[#C9A96E] backdrop-blur-sm">
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
                <h2 className="text-xl font-semibold text-[#F5F0EB]">{p.name}</h2>
                {(p.city || p.country) && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-sm text-[#6B6B6F]">
                    <MapPin size={13} />
                    <span>{[p.address, p.city, p.country].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>

              {p.description && (
                <div>
                  <h3 className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider mb-2">Description</h3>
                  <div
                    className="lodgify-description text-sm text-[#A0A0A4] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: p.description }}
                  />
                </div>
              )}

              {/* Thumbnail strip */}
              {imgs.length > 1 && (
                <div>
                  <h3 className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider mb-2">Photos</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {imgs.map((src: string, i: number) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all ${i === imgIdx ? 'border-[#C9A96E]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
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
              <div className="rounded-xl border border-[#242428] bg-[#111113] p-4 space-y-3">
                <h3 className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Caractéristiques</h3>
                {p.maxGuests && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-[#6B6B6F]"><Users size={14} /><span>Voyageurs</span></div>
                    <span className="text-[#F5F0EB] font-medium">{p.maxGuests}</span>
                  </div>
                )}
                {p.bedrooms && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-[#6B6B6F]"><BedDouble size={14} /><span>Chambres</span></div>
                    <span className="text-[#F5F0EB] font-medium">{p.bedrooms}</span>
                  </div>
                )}
                {p.bathrooms && (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-[#6B6B6F]"><Bath size={14} /><span>Salles de bain</span></div>
                    <span className="text-[#F5F0EB] font-medium">{p.bathrooms}</span>
                  </div>
                )}
              </div>

              {p.lodgifyUrl && (
                <a href={p.lodgifyUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-[#C9A96E]/30 text-[#C9A96E] text-sm hover:bg-[#C9A96E]/10 transition-colors">
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

function LodgifyVillaCard({ p, isSaved, onSave, onClick }: { p: any; isSaved: boolean; onSave: () => void; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="rounded-xl border border-[#242428] bg-[#111113] overflow-hidden flex flex-col h-full cursor-pointer hover:border-[#C9A96E]/30 transition-all duration-200"
    >
      <div className="aspect-video bg-[#1A1A1D] relative overflow-hidden">
        {p.coverImage ? (
          <img
            src={p.coverImage}
            alt={p.name}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 size={32} className="text-[#242428]" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <span className="px-2 py-0.5 rounded-full text-[10px] border border-[#C9A96E]/30 bg-[#C9A96E]/10 text-[#C9A96E]">Lodgify</span>
        </div>
        {/* Save button */}
        <div className="absolute top-3 right-3" onClick={(e) => e.stopPropagation()}>
          {isSaved ? (
            <span className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-[#2D7A4F]/20 border border-[#2D7A4F]/40 text-green-400 whitespace-nowrap">
              <Check size={10} /><span>En base</span>
            </span>
          ) : (
            <button
              onClick={onSave}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-[#0A0A0B]/80 border border-[#242428] text-[#6B6B6F] hover:text-[#C9A96E] hover:border-[#C9A96E]/40 transition-all backdrop-blur-sm whitespace-nowrap"
            >
              <Download size={10} /><span>Sauvegarder</span>
            </button>
          )}
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h3 className="text-sm font-medium text-[#F5F0EB] truncate">{p.name}</h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-[#6B6B6F] flex-1">
          <MapPin size={11} />
          <span>{[p.city, p.country].filter(Boolean).join(', ')}</span>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#242428]">
          {p.maxGuests && <div className="flex items-center gap-1 text-xs text-[#6B6B6F]"><Users size={11} /><span>{p.maxGuests}</span></div>}
          {p.bedrooms && <div className="flex items-center gap-1 text-xs text-[#6B6B6F]"><BedDouble size={11} /><span>{p.bedrooms}</span></div>}
          {p.bathrooms && <div className="flex items-center gap-1 text-xs text-[#6B6B6F]"><Bath size={11} /><span>{p.bathrooms}</span></div>}
        </div>
      </div>
    </motion.div>
  );
}

type ActiveFilter = '' | 'true' | 'false';

export function VillasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [source, setSource] = useState<'local' | 'lodgify'>('local');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('');
  const [countryFilter, setCountryFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVilla, setEditingVilla] = useState<VillaDto | null>(null);
  const [selectedLodgify, setSelectedLodgify] = useState<any | null>(null);

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
      className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
        activeFilter === value
          ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]'
          : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader title="Villas" description={source === 'lodgify' ? `${lodgifyProperties.length} logements Lodgify` : `${meta?.total ?? villas.length} villas au total`}>
        {source === 'local' && (
          <Button
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => { setEditingVilla(null); setModalOpen(true); }}
          >
            Ajouter une villa
          </Button>
        )}
      </PageHeader>

      {/* Source tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSource('local')}
          className={`px-4 py-2 rounded-lg text-sm border transition-all ${source === 'local' ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
        >
          Logements internes
        </button>
        {lodgifyConfigured && (
          <button
            onClick={() => setSource('lodgify')}
            className={`px-4 py-2 rounded-lg text-sm border transition-all ${source === 'lodgify' ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
          >
            🔗 Lodgify
          </button>
        )}
        {source === 'lodgify' && (
          <button onClick={() => { refetchLodgify().catch(() => {}); }} className="p-2 rounded-lg border border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB] hover:bg-[#111113] transition-colors" title="Rafraîchir">
            <RefreshCw size={14} />
          </button>
        )}
      </div>

      {/* Lodgify grid */}
      {source === 'lodgify' && (
        lodgifyLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : lodgifyIsError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 size={40} className="text-[#242428] mb-4" />
            <p className="text-sm text-red-400 mb-1">Erreur Lodgify</p>
            <p className="text-xs text-[#6B6B6F] max-w-md">{(lodgifyError as any)?.response?.data?.message ?? (lodgifyError as any)?.message ?? 'Impossible de contacter Lodgify'}</p>
          </div>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap items-center">
              {/* Sync filter */}
              {(['all', 'new', 'saved'] as const).map((f) => (
                <button key={f} onClick={() => setLodgifySyncFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${lodgifySyncFilter === f ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}>
                  {f === 'all' ? 'Tous' : f === 'new' ? 'Non pushés' : 'En base'}
                </button>
              ))}
              {/* Country filter */}
              {lodgifyCountries.length > 1 && (<>
                <span className="w-px h-4 bg-[#242428]" />
                <button onClick={() => setLodgifyCountryFilter('')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${!lodgifyCountryFilter ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}>
                  Tous les pays
                </button>
                {lodgifyCountries.map((c) => (
                  <button key={c} onClick={() => setLodgifyCountryFilter(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${lodgifyCountryFilter === c ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}>
                    {c}
                  </button>
                ))}
              </>)}
            </div>

            {filteredLodgifyProperties.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Building2 size={40} className="text-[#242428] mb-4" />
                <p className="text-[#6B6B6F]">Aucun logement Lodgify</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredLodgifyProperties.map((p) => (
                  <LodgifyVillaCard
                    key={p.id}
                    p={p}
                    isSaved={syncedIds.has(p.id)}
                    onSave={() => savePropertyMutation.mutate(p)}
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

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : villas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Building2 size={40} className="text-[#242428] mb-4" />
          <p className="text-[#6B6B6F]">Aucune villa trouvée</p>
          <p className="text-xs text-[#6B6B6F] mt-1">Ajoutez votre première villa pour commencer</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {villas.map((villa) => (
            <VillaCard
              key={villa.id}
              villa={villa}
              onClick={() => navigate(`/villas/${villa.id}`)}
              onEdit={() => handleEdit(villa)}
              onDelete={() => handleDelete(villa)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Précédent
          </Button>
          <span className="flex items-center text-xs text-[#6B6B6F] px-4">
            {page} / {meta.totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={page === meta.totalPages} onClick={() => setPage(page + 1)}>
            Suivant
          </Button>
        </div>
      )}

      </>)}

      {selectedLodgify && <LodgifyDetailModal p={selectedLodgify} onClose={() => setSelectedLodgify(null)} />}

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
