import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { ServiceDto, ServiceCategoryDto } from '@mahodge/shared';

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
    duration: service?.duration || '',
    categoryId: service?.categoryId || (categories[0]?.id || ''),
    requiresDate: service?.requiresDate || false,
    requiresTime: service?.requiresTime || false,
    isActive: service?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (service) return apiClient.patch(`/services/${service.id}`, data);
      return apiClient.post('/services', data);
    },
    onSuccess: () => {
      toast.success(service ? 'Service modifié' : 'Service créé');
      qc.invalidateQueries({ queryKey: ['services'] });
      onSuccess();
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
        <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Description</label>
        <textarea
          className="w-full mt-1.5 px-3 py-2.5 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm placeholder:text-[#6B6B6F] focus:outline-none focus:border-[#C9A96E]/60 resize-none"
          rows={3}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          placeholder="Description du service..."
        />
      </div>

      <div>
        <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Catégorie</label>
        <select
          className="w-full mt-1.5 h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
          value={form.categoryId}
          onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        {errors.categoryId && <p className="text-xs text-red-400 mt-1">{errors.categoryId}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Prix de base (€)"
          type="number"
          min="0"
          step="0.01"
          value={String(form.basePrice)}
          onChange={(e) => setForm((p) => ({ ...p, basePrice: Number(e.target.value) }))}
          error={errors.basePrice}
        />
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
              className="w-4 h-4 rounded border border-[#242428] bg-[#111113] accent-[#C9A96E]"
            />
            <span className="text-sm text-[#F5F0EB]">{label}</span>
          </label>
        ))}
      </div>

      <Button type="submit" variant="primary" loading={mutation.isPending} className="w-full">
        {service ? 'Enregistrer' : 'Créer le service'}
      </Button>
    </form>
  );
}
