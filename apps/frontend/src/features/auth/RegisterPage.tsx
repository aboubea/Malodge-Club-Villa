import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { AuthLayout } from './AuthLayout';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { LoginResponseDto } from '@malodge/shared';
import { useCompanyName } from '../../hooks/useCompany';

function useRegister() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      phone?: string;
    }) =>
      apiClient
        .post<{ data: LoginResponseDto }>('/auth/register', data)
        .then((r) => r.data.data ?? (r.data as any)),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Compte créé avec succès !');
      navigate('/');
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { status?: number; data?: { message?: string } } };
      if (!axiosError.response) {
        toast.error('Impossible de contacter le serveur.');
      } else if (axiosError.response.status === 409) {
        toast.error('Un compte existe déjà avec cet email.');
      } else {
        toast.error(axiosError.response.data?.message ?? 'Erreur lors de la création du compte.');
      }
    },
  });
}

export function RegisterPage() {
  const company = useCompanyName();
  const { isAuthenticated } = useAuthStore();
  const mutation = useRegister();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<Partial<typeof form>>({});

  if (isAuthenticated) return <Navigate to="/" replace />;

  const set = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((p) => ({ ...p, [field]: e.target.value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: undefined }));
  };

  const validate = () => {
    const e: Partial<typeof form> = {};
    if (!form.firstName.trim()) e.firstName = 'Prénom requis';
    if (!form.lastName.trim()) e.lastName = 'Nom requis';
    if (!form.email) e.email = 'Email requis';
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Email invalide';
    if (!form.password) e.password = 'Mot de passe requis';
    else if (form.password.length < 8) e.password = 'Minimum 8 caractères';
    if (!form.confirm) e.confirm = 'Confirmation requise';
    else if (form.password !== form.confirm) e.confirm = 'Les mots de passe ne correspondent pas';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    mutation.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim() || undefined,
    });
  };

  return (
    <AuthLayout>

        <div className="mb-9">
          <h1 className="font-display font-semibold text-[30px] leading-[1.02] tracking-tight text-ink">Créer un compte</h1>
          <p className="text-[14.5px] text-muted mt-3">Rejoignez {company}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Prénom"
              placeholder="Jean"
              value={form.firstName}
              onChange={set('firstName')}
              error={errors.firstName}
              autoFocus
            />
            <Input
              label="Nom"
              placeholder="Dupont"
              value={form.lastName}
              onChange={set('lastName')}
              error={errors.lastName}
            />
          </div>

          <Input
            label="Adresse email"
            type="email"
            placeholder="jean@email.com"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            autoComplete="email"
          />

          <Input
            label="Téléphone (optionnel)"
            type="tel"
            placeholder="+33 6 12 34 56 78"
            value={form.phone}
            onChange={set('phone')}
          />

          <Input
            label="Mot de passe"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
            autoComplete="new-password"
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="hover:text-ink transition-colors"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            }
          />

          <Input
            label="Confirmer le mot de passe"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={form.confirm}
            onChange={set('confirm')}
            error={errors.confirm}
            autoComplete="new-password"
          />

          {/* Password strength */}
          <div className="flex gap-3">
            {[
              { label: '8 car.', ok: form.password.length >= 8 },
              { label: 'Majuscule', ok: /[A-Z]/.test(form.password) },
              { label: 'Chiffre', ok: /\d/.test(form.password) },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-1">
                <div
                  className={`w-1.5 h-1.5 rounded-full transition-colors duration-150 ${
                    ok ? 'bg-success' : 'bg-line'
                  }`}
                />
                <span className={`text-xs transition-colors duration-150 ${ok ? 'text-ink' : 'text-muted'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={mutation.isPending}
            className="w-full mt-2"
          >
            Créer mon compte
          </Button>
        </form>

        <div className="mt-6 text-center">
          <span className="text-sm text-muted">Déjà un compte ?{' '}</span>
          <Link to="/login" className="text-sm text-accent hover:text-accent-hover transition-colors">
            Se connecter
          </Link>
        </div>
    </AuthLayout>
  );
}
