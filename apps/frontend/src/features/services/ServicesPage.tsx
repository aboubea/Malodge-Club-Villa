import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Plus, Search, Sparkles, Clock, Euro } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { SlideOver } from '../../components/ui/SlideOver';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency } from '../../lib/utils';
import { ServiceDto } from '@mahodge/shared';
import { ServiceForm } from './ServiceForm';

function ServiceCard({ service, onEdit, onDelete }: {
  service: ServiceDto;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="group rounded-xl border border-[#242428] bg-[#111113] p-5 hover:border-[#C9A96E]/30 transition-all duration-200"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-[#C9A96E]/10 flex items-center justify-center shrink-0">
            <Sparkles size={15} className="text-[#C9A96E]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[#F5F0EB]">{service.name}</p>
            {service.category && (
              <p className="text-xs text-[#6B6B6F]">{service.category.name}</p>
            )}
          </div>
        </div>
        <Badge variant={service.isActive ? 'active' : 'inactive'} size="sm">
          {service.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      </div>

      {service.description && (
        <p className="text-xs text-[#6B6B6F] leading-relaxed mb-3 line-clamp-2">{service.description}</p>
      )}

      <div className="flex items-center gap-4 text-xs text-[#6B6B6F] mb-4">
        <span className="flex items-center gap-1">
          <Euro size={11} />
          {formatCurrency(service.basePrice)}
        </span>
        {service.duration && (
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {service.duration} min
          </span>
        )}
      </div>

      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onEdit}>Modifier</Button>
        <Button variant="destructive" size="sm" onClick={onDelete}>Supprimer</Button>
      </div>
    </motion.div>
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
      const params = new URLSearchParams({ limit: '20' });
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

  const services: ServiceDto[] = data?.data || data || [];
  const categories = categoriesData?.data || categoriesData || [];

  return (
    <div className="space-y-6 max-w-[1400px]">
      <PageHeader title="Services" description={`${services.length} services disponibles`}>
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
            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${!categoryId ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
          >
            Tous
          </button>
          {categories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => setCategoryId(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${categoryId === cat.id ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]' : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : services.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Sparkles size={40} className="text-[#242428] mb-4" />
          <p className="text-[#6B6B6F]">Aucun service trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {services.map((s) => (
            <ServiceCard
              key={s.id}
              service={s}
              onEdit={() => { setEditingService(s); setSlideOpen(true); }}
              onDelete={() => { if (confirm(`Supprimer "${s.name}" ?`)) deleteMutation.mutate(s.id); }}
            />
          ))}
        </div>
      )}

      <SlideOver
        open={slideOpen}
        onClose={() => { setSlideOpen(false); setEditingService(null); }}
        title={editingService ? 'Modifier le service' : 'Ajouter un service'}
      >
        <ServiceForm
          service={editingService}
          categories={categories}
          onSuccess={() => { setSlideOpen(false); setEditingService(null); }}
        />
      </SlideOver>
    </div>
  );
}
