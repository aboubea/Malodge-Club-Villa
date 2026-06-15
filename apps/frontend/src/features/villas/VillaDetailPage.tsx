import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Building2,
  MapPin,
  Users,
  BedDouble,
  Bath,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardContent, CardTitle } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { VillaDto } from '@malodge/shared';
import { VillaForm } from './VillaForm';

export function VillaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: villa, isLoading } = useQuery<VillaDto>({
    queryKey: ['villa', id],
    queryFn: async () => {
      const res = await apiClient.get(`/villas/${id}`);
      return res.data.data || res.data;
    },
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiClient.delete(`/villas/${id}`),
    onSuccess: () => {
      toast.success('Villa supprimée');
      qc.invalidateQueries({ queryKey: ['villas'] });
      navigate('/villas');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => apiClient.patch(`/villas/${id}`, { isActive }),
    onSuccess: () => {
      toast.success('Statut mis à jour');
      qc.invalidateQueries({ queryKey: ['villa', id] });
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-[1400px]">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-2" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!villa) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Building2 size={40} className="text-[#242428] mb-4" />
        <p className="text-[#6B6B6F]">Villa introuvable</p>
        <Button variant="ghost" size="sm" className="mt-4" onClick={() => navigate('/villas')}>
          Retour aux villas
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/villas')}
          className="text-[#6B6B6F] hover:text-[#F5F0EB] transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <span className="text-xs text-[#6B6B6F]">Villas</span>
      </div>

      <PageHeader
        title={villa.name}
        description={`${villa.city}, ${villa.country}`}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            icon={villa.isActive ? <XCircle size={13} /> : <CheckCircle2 size={13} />}
            onClick={() => toggleActiveMutation.mutate(!villa.isActive)}
            loading={toggleActiveMutation.isPending}
          >
            {villa.isActive ? 'Désactiver' : 'Activer'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil size={13} />}
            onClick={() => setEditOpen(true)}
          >
            Modifier
          </Button>
          <Button
            variant="destructive"
            size="sm"
            icon={<Trash2 size={13} />}
            onClick={() => {
              if (confirm(`Supprimer "${villa.name}" définitivement ?`)) {
                deleteMutation.mutate();
              }
            }}
            loading={deleteMutation.isPending}
          >
            Supprimer
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="lg:col-span-2 space-y-4"
        >
          {/* Cover image */}
          <div className="aspect-video rounded-xl overflow-hidden bg-[#1A1A1D] border border-[#242428]">
            {villa.coverImage ? (
              <img src={villa.coverImage} alt={villa.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 size={48} className="text-[#242428]" />
              </div>
            )}
          </div>

          {/* Description */}
          {villa.description && (
            <Card>
              <CardHeader>
                <CardTitle>Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#6B6B6F] leading-relaxed">{villa.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Amenities */}
          {villa.amenities && villa.amenities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Équipements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {villa.amenities.map((amenity) => (
                    <Badge key={amenity} variant="default">{amenity}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rules */}
          {villa.rules && villa.rules.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Règles</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1">
                  {villa.rules.map((rule) => (
                    <li key={rule} className="text-sm text-[#6B6B6F] flex items-start gap-2">
                      <span className="text-[#C9A96E] mt-0.5">•</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="space-y-4"
        >
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant={villa.isActive ? 'active' : 'inactive'}>
                  {villa.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>

              <div className="flex items-start gap-2 text-sm">
                <MapPin size={14} className="text-[#6B6B6F] mt-0.5 shrink-0" />
                <div>
                  <p className="text-[#F5F0EB]">{villa.address}</p>
                  <p className="text-[#6B6B6F]">{villa.city}, {villa.country}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2 border-t border-[#242428]">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Users size={14} className="text-[#6B6B6F]" />
                  </div>
                  <p className="text-lg font-light text-[#F5F0EB]">{villa.maxGuests}</p>
                  <p className="text-[10px] text-[#6B6B6F]">Voyageurs</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <BedDouble size={14} className="text-[#6B6B6F]" />
                  </div>
                  <p className="text-lg font-light text-[#F5F0EB]">{villa.bedrooms}</p>
                  <p className="text-[10px] text-[#6B6B6F]">Chambres</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center mb-1">
                    <Bath size={14} className="text-[#6B6B6F]" />
                  </div>
                  <p className="text-lg font-light text-[#F5F0EB]">{villa.bathrooms}</p>
                  <p className="text-[10px] text-[#6B6B6F]">SDB</p>
                </div>
              </div>

              {(villa.latitude || villa.longitude) && (
                <div className="pt-2 border-t border-[#242428]">
                  <p className="text-xs text-[#6B6B6F]">Coordonnées</p>
                  <p className="text-xs text-[#F5F0EB] mt-1">
                    {villa.latitude}, {villa.longitude}
                  </p>
                </div>
              )}

              {villa.logifyId && (
                <div className="pt-2 border-t border-[#242428]">
                  <p className="text-xs text-[#6B6B6F]">ID Logify</p>
                  <p className="text-xs font-mono text-[#C9A96E] mt-1">{villa.logifyId}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Modifier la villa"
        description={`Modifier les informations de ${villa.name}`}
        size="lg"
      >
        <VillaForm
          villa={villa}
          onSuccess={() => {
            setEditOpen(false);
            qc.invalidateQueries({ queryKey: ['villa', id] });
          }}
        />
      </Modal>
    </div>
  );
}
