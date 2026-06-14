import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Building2, MapPin, Users, BedDouble, Bath, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { SlideOver } from '../../components/ui/SlideOver';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency } from '../../lib/utils';
import { VillaDto } from '@mahodge/shared';
import { VillaForm } from './VillaForm';

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
      className="group relative rounded-xl border border-[#242428] bg-[#111113] overflow-hidden hover:border-[#C9A96E]/30 transition-all duration-200 cursor-pointer"
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
      <div className="p-4">
        <h3 className="text-sm font-medium text-[#F5F0EB] truncate">{villa.name}</h3>
        <div className="flex items-center gap-1 mt-1 text-xs text-[#6B6B6F]">
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

export function VillasPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingVilla, setEditingVilla] = useState<VillaDto | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['villas', { page, search }],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (search) params.set('search', search);
      const res = await apiClient.get(`/villas?${params}`);
      return res.data.data || res.data;
    },
    staleTime: 30000,
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
    setSlideOpen(true);
  };

  const handleDelete = (villa: VillaDto) => {
    if (confirm(`Supprimer "${villa.name}" ?`)) {
      deleteMutation.mutate(villa.id);
    }
  };

  const handleSlideClose = () => {
    setSlideOpen(false);
    setEditingVilla(null);
  };

  const villas: VillaDto[] = data?.data || data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader title="Villas" description={`${meta?.total ?? villas.length} villas au total`}>
        <Button
          variant="primary"
          icon={<Plus size={14} />}
          onClick={() => { setEditingVilla(null); setSlideOpen(true); }}
        >
          Ajouter une villa
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="max-w-xs w-full">
          <Input
            placeholder="Rechercher une villa..."
            leftIcon={<Search size={13} />}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Button variant="secondary" size="sm">Toutes</Button>
        <Button variant="ghost" size="sm">Actives</Button>
        <Button variant="ghost" size="sm">Inactives</Button>
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

      {/* SlideOver Form */}
      <SlideOver
        open={slideOpen}
        onClose={handleSlideClose}
        title={editingVilla ? 'Modifier la villa' : 'Ajouter une villa'}
        description={editingVilla ? `Modifier les informations de ${editingVilla.name}` : 'Renseignez les informations de la nouvelle villa'}
      >
        <VillaForm
          villa={editingVilla}
          onSuccess={handleSlideClose}
        />
      </SlideOver>
    </div>
  );
}
