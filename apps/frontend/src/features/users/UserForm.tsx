import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { UserDto, Role } from '@malodge/shared';
import { ROLES_LABELS } from '../../lib/constants';

interface UserFormProps {
  user?: UserDto | null;
  onSuccess: () => void;
}

export function UserForm({ user, onSuccess }: UserFormProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    role: user?.role || Role.CLIENT,
    password: '',
    isActive: user?.isActive ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (user) {
        const { password, ...rest } = data;
        return apiClient.patch(`/users/${user.id}`, rest);
      }
      return apiClient.post('/users', data);
    },
    onSuccess: () => {
      toast.success(user ? 'Utilisateur modifié' : 'Utilisateur créé');
      qc.invalidateQueries({ queryKey: ['users'] });
      onSuccess();
    },
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.email) e.email = 'Email requis';
    if (!form.firstName) e.firstName = 'Prénom requis';
    if (!form.lastName) e.lastName = 'Nom requis';
    if (!user && !form.password) e.password = 'Mot de passe requis';
    if (!user && form.password && form.password.length < 6) e.password = 'Minimum 6 caractères';
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
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Prénom"
          placeholder="Jean"
          value={form.firstName}
          onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
          error={errors.firstName}
        />
        <Input
          label="Nom"
          placeholder="Dupont"
          value={form.lastName}
          onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
          error={errors.lastName}
        />
      </div>

      <Input
        label="Email"
        type="email"
        placeholder="jean.dupont@email.com"
        value={form.email}
        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
        error={errors.email}
      />

      <Input
        label="Téléphone"
        type="tel"
        placeholder="+33 6 00 00 00 00"
        value={form.phone}
        onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
      />

      {!user && (
        <Input
          label="Mot de passe"
          type="password"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
          error={errors.password}
        />
      )}

      <div>
        <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">Rôle</label>
        <select
          className="w-full mt-1.5 h-10 px-3 rounded-lg bg-[#111113] border border-[#242428] text-[#F5F0EB] text-sm focus:outline-none focus:border-[#C9A96E]/60"
          value={form.role}
          onChange={(e) => setForm((p) => ({ ...p, role: e.target.value as Role }))}
        >
          {Object.entries(ROLES_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {user && (
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
            className="w-4 h-4 rounded border border-[#242428] bg-[#111113] accent-[#C9A96E]"
          />
          <span className="text-sm text-[#F5F0EB]">Utilisateur actif</span>
        </label>
      )}

      <Button type="submit" variant="primary" loading={mutation.isPending} className="w-full">
        {user ? 'Enregistrer' : "Créer l'utilisateur"}
      </Button>
    </form>
  );
}
