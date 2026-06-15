import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { apiClient } from '../../lib/apiClient';
import { UserDto, Role } from '@malodge/shared';
import { ROLES_LABELS } from '../../lib/constants';
import { useAuthStore } from '../../store/authStore';
import { useCountries } from '../../hooks/useCountries';

interface UserFormProps {
  user?: UserDto | null;
  onSuccess: () => void;
}

const STAFF_ROLES: string[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.MANAGER, Role.PROVIDER];

export function UserForm({ user, onSuccess }: UserFormProps) {
  const qc = useQueryClient();
  const { user: currentUser } = useAuthStore();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const { data: countriesData } = useCountries();
  const availableCountries = countriesData ?? [];

  const [form, setForm] = useState({
    email: user?.email || '',
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    phone: user?.phone || '',
    role: user?.role || Role.CLIENT,
    password: '',
    isActive: user?.isActive ?? true,
  });
  const [selectedCountries, setSelectedCountries] = useState<string[]>(user?.countries || []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload: any = { ...data };
      if (user) {
        delete payload.password;
      }
      if (isSuperAdmin && STAFF_ROLES.includes(payload.role)) {
        payload.countries = selectedCountries;
      }
      if (user) {
        return apiClient.patch(`/users/${user.id}`, payload);
      }
      return apiClient.post('/users', payload);
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

  function toggleCountry(name: string) {
    setSelectedCountries((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name],
    );
  }

  const showCountries = isSuperAdmin && STAFF_ROLES.includes(form.role) && form.role !== Role.CLIENT;

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
          onChange={(e) => {
            const newRole = e.target.value as Role;
            setForm((p) => ({ ...p, role: newRole }));
            if (newRole === Role.CLIENT) setSelectedCountries([]);
          }}
        >
          {Object.entries(ROLES_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {showCountries && availableCountries.length > 0 && (
        <div>
          <label className="text-xs font-medium text-[#6B6B6F] uppercase tracking-wider">
            Pays assignés
            <span className="ml-2 normal-case font-normal text-[#3A3A3E]">
              (laisser vide = accès global)
            </span>
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {availableCountries.map((c) => {
              const active = selectedCountries.includes(c.name);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCountry(c.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                    active
                      ? 'border-[#C9A96E]/40 bg-[#C9A96E]/10 text-[#C9A96E]'
                      : 'border-[#242428] text-[#6B6B6F] hover:text-[#F5F0EB]'
                  }`}
                >
                  {c.flag} {c.name}
                </button>
              );
            })}
          </div>
          {selectedCountries.length > 0 && (
            <p className="mt-1.5 text-[11px] text-[#6B6B6F]">
              Restreint à : {selectedCountries.join(', ')}
            </p>
          )}
        </div>
      )}

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
