import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { VillaDto, CreateVillaDto } from '@malodge/shared';

interface VillaFormProps {
  villa?: VillaDto | null;
  onSuccess: () => void;
}

export function VillaForm({ villa, onSuccess }: VillaFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateVillaDto>({
    name: villa?.name || '',
    description: villa?.description || '',
    address: villa?.address || '',
    city: villa?.city || '',
    country: villa?.country || 'France',
    latitude: villa?.latitude || undefined,
    longitude: villa?.longitude || undefined,
    maxGuests: villa?.maxGuests || 1,
    bedrooms: villa?.bedrooms || 1,
    bathrooms: villa?.bathrooms || 1,
    coverImage: villa?.coverImage || '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateVillaDto, string>>>({});

  const mutation = useMutation({
    mutationFn: async (data: CreateVillaDto) => {
      if (villa) {
        return apiClient.patch(`/villas/${villa.id}`, data);
      }
      return apiClient.post('/villas', data);
    },
    onSuccess: () => {
      toast.success(villa ? 'Villa modifiée' : 'Villa créée');
      qc.invalidateQueries({ queryKey: ['villas'] });
      onSuccess();
    },
  });

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name) e.name = 'Nom requis';
    if (!form.address) e.address = 'Adresse requise';
    if (!form.city) e.city = 'Ville requise';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate(form);
  };

  const set = (field: keyof CreateVillaDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Nom de la villa" placeholder="Villa Émeraude" value={form.name} onChange={set('name')} error={errors.name} />

      <div>
        <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Description</label>
        <textarea
          className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/60 focus:ring-1 focus:ring-[#C9A96E]/20 transition-all resize-none"
          rows={3}
          placeholder="Description de la villa..."
          value={form.description || ''}
          onChange={set('description')}
        />
      </div>

      <Input label="Adresse" placeholder="12 Rue de la Mer" value={form.address} onChange={set('address')} error={errors.address} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Ville" placeholder="Saint-Tropez" value={form.city} onChange={set('city')} error={errors.city} />
        <Input label="Pays" placeholder="France" value={form.country || ''} onChange={set('country')} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Input label="Voyageurs max" type="number" min="1" value={String(form.maxGuests || 1)} onChange={set('maxGuests')} />
        <Input label="Chambres" type="number" min="1" value={String(form.bedrooms || 1)} onChange={set('bedrooms')} />
        <Input label="Salles de bain" type="number" min="1" value={String(form.bathrooms || 1)} onChange={set('bathrooms')} />
      </div>

      <Input label="URL image principale" placeholder="https://..." value={form.coverImage || ''} onChange={set('coverImage')} />

      <div className="grid grid-cols-2 gap-3">
        <Input label="Latitude" type="number" step="any" placeholder="43.2965" value={form.latitude !== undefined ? String(form.latitude) : ''} onChange={set('latitude')} />
        <Input label="Longitude" type="number" step="any" placeholder="5.3698" value={form.longitude !== undefined ? String(form.longitude) : ''} onChange={set('longitude')} />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" loading={mutation.isPending} className="flex-1">
          {villa ? 'Enregistrer les modifications' : 'Créer la villa'}
        </Button>
      </div>
    </form>
  );
}
