import { useState, useEffect } from 'react';
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
  Plus,
  Sparkles,
  Euro,
  List,
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
import { useAuthStore } from '../../store/authStore';

export function VillaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStaff = user?.role && ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(user.role);
  const [editOpen, setEditOpen] = useState(false);

  // Custom fields state
  const [customFields, setCustomFields] = useState<Array<{ label: string; value: string }>>([]);
  const [editingFieldIdx, setEditingFieldIdx] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const { data: villa, isLoading } = useQuery<VillaDto>({
    queryKey: ['villa', id],
    queryFn: async () => {
      const res = await apiClient.get(`/villas/${id}`);
      return res.data.data || res.data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (villa?.customFields) {
      setCustomFields(Array.isArray(villa.customFields) ? (villa.customFields as Array<{ label: string; value: string }>) : []);
    } else {
      setCustomFields([]);
    }
  }, [villa]);

  const updateCustomFieldsMutation = useMutation({
    mutationFn: (fields: Array<{ label: string; value: string }>) =>
      apiClient.patch(`/villas/${id}`, { customFields: fields }),
    onSuccess: () => {
      toast.success('Champs mis à jour');
      qc.invalidateQueries({ queryKey: ['villa', id] });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
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

          {/* Custom fields */}
          {(isStaff || customFields.length > 0) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <List size={14} className="text-[#C9A96E]" />
                    Informations complémentaires
                  </CardTitle>
                  {isStaff && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={12} />}
                      onClick={() => { setAddingField(true); setNewFieldLabel(''); setNewFieldValue(''); }}
                      disabled={addingField}
                    >
                      Ajouter
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {customFields.length === 0 && !addingField && (
                  <p className="text-sm text-[#6B6B6F] text-center py-4">
                    {isStaff ? 'Aucun champ. Cliquez sur Ajouter pour en créer.' : 'Aucune information complémentaire.'}
                  </p>
                )}

                {customFields.map((field, idx) => (
                  <div key={idx}>
                    {editingFieldIdx === idx ? (
                      <div className="flex items-center gap-2">
                        <input
                          className="flex-1 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                          placeholder="Label"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                        <input
                          className="flex-1 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                          placeholder="Valeur"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          loading={updateCustomFieldsMutation.isPending}
                          onClick={() => {
                            if (!editLabel.trim()) return;
                            const updated = customFields.map((f, i) =>
                              i === idx ? { label: editLabel.trim(), value: editValue.trim() } : f
                            );
                            setCustomFields(updated);
                            updateCustomFieldsMutation.mutate(updated);
                            setEditingFieldIdx(null);
                          }}
                        >
                          OK
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingFieldIdx(null)}>✕</Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-[#111113] border border-[#242428]">
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-[#6B6B6F] uppercase tracking-wider">{field.label}</p>
                          <p className="text-sm text-[#F5F0EB] mt-0.5">{field.value}</p>
                        </div>
                        {isStaff && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => { setEditingFieldIdx(idx); setEditLabel(field.label); setEditValue(field.value); }}
                              className="p-1.5 text-[#6B6B6F] hover:text-[#C9A96E] transition-colors"
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              onClick={() => {
                                const updated = customFields.filter((_, i) => i !== idx);
                                setCustomFields(updated);
                                updateCustomFieldsMutation.mutate(updated);
                              }}
                              className="p-1.5 text-[#6B6B6F] hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {addingField && (
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      className="flex-1 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                      placeholder="Label (ex: Code WiFi)"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="flex-1 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                      placeholder="Valeur"
                      value={newFieldValue}
                      onChange={(e) => setNewFieldValue(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="primary"
                      loading={updateCustomFieldsMutation.isPending}
                      onClick={() => {
                        if (!newFieldLabel.trim()) return;
                        const updated = [...customFields, { label: newFieldLabel.trim(), value: newFieldValue.trim() }];
                        setCustomFields(updated);
                        updateCustomFieldsMutation.mutate(updated);
                        setAddingField(false);
                      }}
                    >
                      OK
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setAddingField(false)}>✕</Button>
                  </div>
                )}
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
