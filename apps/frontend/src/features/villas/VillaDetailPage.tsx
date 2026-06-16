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
import { Input } from '../../components/ui/Input';
import { Skeleton } from '../../components/ui/Skeleton';
import { apiClient } from '../../lib/apiClient';
import { formatCurrency } from '../../lib/utils';
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
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [editServiceId, setEditServiceId] = useState<string | null>(null);
  const [customPrice, setCustomPrice] = useState('');
  const [commission, setCommission] = useState('15');
  const [commissionTo, setCommissionTo] = useState<'manager' | 'owner' | 'shared'>('manager');
  const [ownerShare, setOwnerShare] = useState('50');
  const [serviceSearch, setServiceSearch] = useState('');

  // Custom fields state
  const [customFields, setCustomFields] = useState<Array<{ label: string; value: string }>>([]);
  const [editingFieldIdx, setEditingFieldIdx] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editValue, setEditValue] = useState('');
  const [addingField, setAddingField] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);

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
    onError: () => toast.error('Erreur lors de la suppression de la villa'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (isActive: boolean) => apiClient.patch(`/villas/${id}`, { isActive }),
    onSuccess: () => {
      toast.success('Statut mis à jour');
      qc.invalidateQueries({ queryKey: ['villa', id] });
      qc.invalidateQueries({ queryKey: ['villas'] });
    },
  });

  // Villa services
  const { data: villaServicesData } = useQuery({
    queryKey: ['villa-services', id],
    queryFn: async () => {
      const res = await apiClient.get(`/villas/${id}/services`);
      return res.data.data ?? res.data;
    },
    enabled: !!id && isStaff,
  });
  const villaServices: any[] = villaServicesData ?? [];

  // All services for the add-service modal
  const { data: allServicesData } = useQuery({
    queryKey: ['services-all', serviceSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '50', activeOnly: 'true' });
      if (serviceSearch) params.set('search', serviceSearch);
      const res = await apiClient.get(`/services?${params}`);
      return (res.data.data ?? res.data)?.data ?? res.data?.data ?? [];
    },
    enabled: addServiceOpen,
  });
  const allServices: any[] = allServicesData ?? [];
  const linkedServiceIds = new Set(villaServices.map((vs: any) => vs.serviceId));

  const assignServiceMutation = useMutation({
    mutationFn: ({ serviceId, cp, cm, cto, os }: { serviceId: string; cp?: number; cm?: number; cto?: string; os?: number }) =>
      apiClient.post(`/villas/${id}/services/${serviceId}`, {
        customPrice: cp,
        commission: cm,
        commissionTo: cto ?? 'manager',
        ownerShare: os,
      }),
    onSuccess: () => {
      toast.success('Service ajouté à la villa');
      qc.invalidateQueries({ queryKey: ['villa-services', id] });
      setAddServiceOpen(false);
      setServiceSearch('');
      setCustomPrice('');
    },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ serviceId, cp, cm, cto, os }: { serviceId: string; cp?: number | null; cm?: number; cto?: string; os?: number }) =>
      apiClient.patch(`/villas/${id}/services/${serviceId}`, {
        customPrice: cp,
        commission: cm,
        commissionTo: cto,
        ownerShare: os,
      }),
    onSuccess: () => {
      toast.success('Prix mis à jour');
      qc.invalidateQueries({ queryKey: ['villa-services', id] });
      setEditServiceId(null);
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });

  const removeServiceMutation = useMutation({
    mutationFn: (serviceId: string) => apiClient.delete(`/villas/${id}/services/${serviceId}`),
    onSuccess: () => {
      toast.success('Service retiré');
      qc.invalidateQueries({ queryKey: ['villa-services', id] });
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
                <p
                  className="text-sm text-[#6B6B6F] leading-relaxed"
                  style={!descExpanded ? { overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 10 } : undefined}
                >
                  {villa.description}
                </p>
                <button
                  onClick={() => setDescExpanded((v) => !v)}
                  className="mt-2 text-xs text-[#C9A96E] hover:text-[#E8C98A] transition-colors"
                >
                  {descExpanded ? 'Voir moins ↑' : 'Voir plus ↓'}
                </button>
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

          {/* Custom fields */}
          {(isStaff || customFields.length > 0) && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <List size={14} className="text-[#C9A96E]" />
                    Infos complémentaires
                  </CardTitle>
                  {isStaff && (
                    <button
                      onClick={() => { setAddingField(true); setNewFieldLabel(''); setNewFieldValue(''); }}
                      disabled={addingField}
                      className="p-1 text-[#6B6B6F] hover:text-[#C9A96E] transition-colors disabled:opacity-40"
                    >
                      <Plus size={13} />
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {customFields.length === 0 && !addingField && (
                  <p className="text-xs text-[#6B6B6F] text-center py-2">
                    {isStaff ? 'Cliquez sur + pour ajouter.' : '—'}
                  </p>
                )}

                {customFields.map((field, idx) => (
                  <div key={idx}>
                    {editingFieldIdx === idx ? (
                      <div className="space-y-1">
                        <input
                          className="w-full h-7 px-2 rounded-md bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                          placeholder="Label"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                        />
                        <input
                          className="w-full h-7 px-2 rounded-md bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                          placeholder="Valeur"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                        />
                        <div className="flex gap-1">
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
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 py-2 border-b border-[#1A1A1D] last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-[#6B6B6F] uppercase tracking-wider">{field.label}</p>
                          <p className="text-xs text-[#F5F0EB] mt-0.5 break-words">{field.value}</p>
                        </div>
                        {isStaff && (
                          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                            <button
                              onClick={() => { setEditingFieldIdx(idx); setEditLabel(field.label); setEditValue(field.value); }}
                              className="p-1 text-[#6B6B6F] hover:text-[#C9A96E] transition-colors"
                            >
                              <Pencil size={11} />
                            </button>
                            <button
                              onClick={() => {
                                const updated = customFields.filter((_, i) => i !== idx);
                                setCustomFields(updated);
                                updateCustomFieldsMutation.mutate(updated);
                              }}
                              className="p-1 text-[#6B6B6F] hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {addingField && (
                  <div className="space-y-1 pt-1">
                    <input
                      className="w-full h-7 px-2 rounded-md bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                      placeholder="Label (ex: Code WiFi)"
                      value={newFieldLabel}
                      onChange={(e) => setNewFieldLabel(e.target.value)}
                      autoFocus
                    />
                    <input
                      className="w-full h-7 px-2 rounded-md bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                      placeholder="Valeur"
                      value={newFieldValue}
                      onChange={(e) => setNewFieldValue(e.target.value)}
                    />
                    <div className="flex gap-1">
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
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      </div>

      {/* Villa Services Section — staff only */}
      {isStaff && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles size={14} className="text-[#C9A96E]" />
                  Services disponibles ({villaServices.length})
                </CardTitle>
                <Button variant="secondary" size="sm" icon={<Plus size={12} />} onClick={() => setAddServiceOpen(true)}>
                  Ajouter un service
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {villaServices.length === 0 ? (
                <p className="text-sm text-[#6B6B6F] text-center py-6">Aucun service assigné à cette villa</p>
              ) : (
                <div className="space-y-2">
                  {villaServices.map((vs: any) => {
                    const effectivePrice = vs.customPrice ?? vs.service.basePrice;
                    const isEditing = editServiceId === vs.serviceId;
                    return (
                      <div key={vs.serviceId} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-[#111113] border border-[#242428]">
                        <div className="w-8 h-8 rounded-lg bg-[#C9A96E]/10 flex items-center justify-center shrink-0">
                          <Sparkles size={12} className="text-[#C9A96E]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[#F5F0EB] font-medium truncate">{vs.service.name}</p>
                          <p className="text-[11px] text-[#6B6B6F]">{vs.service.category?.name}</p>
                          {vs.service.providers && vs.service.providers.length > 0 && (
                            <p className="text-[10px] text-[#6B6B6F] mt-0.5">
                              {vs.service.providers.slice(0, 2).map((p: any) =>
                                `${p.provider.user.firstName} ${p.provider.user.lastName}`
                              ).join(', ')}
                            </p>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              placeholder={`Prix (défaut: ${vs.service.basePrice})`}
                              className="w-36 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#C9A96E]/40 text-[#F5F0EB] text-xs focus:outline-none"
                              value={customPrice}
                              onChange={(e) => setCustomPrice(e.target.value)}
                            />
                            <input
                              type="number"
                              placeholder="Comm. %"
                              className="w-20 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#242428] text-[#F5F0EB] text-xs focus:outline-none"
                              value={commission}
                              onChange={(e) => setCommission(e.target.value)}
                            />
                            <select
                              value={commissionTo}
                              onChange={(e) => setCommissionTo(e.target.value as any)}
                              className="h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#242428] text-[#F5F0EB] text-xs focus:outline-none"
                            >
                              <option value="manager">→ Manager</option>
                              <option value="owner">→ Proprio</option>
                              <option value="shared">Partagé</option>
                            </select>
                            {commissionTo === 'shared' && (
                              <input
                                type="number"
                                placeholder="% proprio"
                                className="w-20 h-8 px-2 rounded-lg bg-[#0A0A0B] border border-[#242428] text-[#F5F0EB] text-xs focus:outline-none"
                                value={ownerShare}
                                onChange={(e) => setOwnerShare(e.target.value)}
                              />
                            )}
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => updateServiceMutation.mutate({
                                serviceId: vs.serviceId,
                                cp: customPrice ? Number(customPrice) : null,
                                cm: commission ? Number(commission) : 15,
                                cto: commissionTo,
                                os: commissionTo === 'shared' ? Number(ownerShare) : undefined,
                              })}
                              loading={updateServiceMutation.isPending}
                            >
                              OK
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditServiceId(null)}>✕</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-light text-[#C9A96E]">{formatCurrency(effectivePrice)}</p>
                              {vs.customPrice && (
                                <p className="text-[10px] text-[#6B6B6F]">défaut: {formatCurrency(vs.service.basePrice)}</p>
                              )}
                              <p className="text-[10px] text-[#6B6B6F]">Comm. {vs.commission ?? 15}% → {
                                vs.commissionTo === 'owner' ? 'Proprio' :
                                vs.commissionTo === 'shared' ? `${100 - (vs.ownerShare ?? 50)}% Mgr / ${vs.ownerShare ?? 50}% Proprio` :
                                'Manager'
                              }</p>
                            </div>
                            <button
                              onClick={() => {
                                setEditServiceId(vs.serviceId);
                                setCustomPrice(vs.customPrice?.toString() || '');
                                setCommission((vs.commission ?? 15).toString());
                                setCommissionTo(vs.commissionTo ?? 'manager');
                                setOwnerShare((vs.ownerShare ?? 50).toString());
                              }}
                              className="p-1.5 text-[#6B6B6F] hover:text-[#C9A96E] transition-colors"
                            >
                              <Euro size={13} />
                            </button>
                            <button
                              onClick={() => { if (confirm(`Retirer "${vs.service.name}" ?`)) removeServiceMutation.mutate(vs.serviceId); }}
                              className="p-1.5 text-[#6B6B6F] hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Add service modal */}
      <Modal open={addServiceOpen} onClose={() => { setAddServiceOpen(false); setServiceSearch(''); setCustomPrice(''); }} title="Ajouter un service" size="lg">
        <div className="space-y-4">
          <Input
            placeholder="Rechercher un service..."
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
          />
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {allServices
              .filter((s: any) => !linkedServiceIds.has(s.id))
              .map((s: any) => (
                <div key={s.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-[#111113] border border-[#242428] hover:border-[#C9A96E]/20 transition-colors">
                  <div>
                    <p className="text-sm text-[#F5F0EB]">{s.name}</p>
                    <p className="text-[11px] text-[#6B6B6F]">{s.category?.name} · {formatCurrency(s.basePrice)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={12} />}
                    onClick={() => assignServiceMutation.mutate({
                      serviceId: s.id,
                      cp: customPrice ? Number(customPrice) : undefined,
                      cm: commission ? Number(commission) : 15,
                      cto: 'manager',
                      os: 50,
                    })}
                    loading={assignServiceMutation.isPending}
                  >
                    Ajouter
                  </Button>
                </div>
              ))}
            {allServices.filter((s: any) => !linkedServiceIds.has(s.id)).length === 0 && (
              <p className="text-sm text-[#6B6B6F] text-center py-4">Tous les services sont déjà assignés</p>
            )}
          </div>
          <div className="flex gap-3 pt-2 border-t border-[#242428]">
            <div className="flex-1">
              <label className="text-xs text-[#6B6B6F]">Prix personnalisé (optionnel)</label>
              <input
                type="number"
                placeholder="Laisser vide = prix de base"
                className="w-full mt-1 h-9 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                value={customPrice}
                onChange={(e) => setCustomPrice(e.target.value)}
              />
            </div>
            <div className="w-28">
              <label className="text-xs text-[#6B6B6F]">Commission %</label>
              <input
                type="number"
                placeholder="15"
                className="w-full mt-1 h-9 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
              />
            </div>
          </div>
        </div>
      </Modal>

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
